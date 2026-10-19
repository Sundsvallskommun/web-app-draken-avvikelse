import { Type as TypeTransformer } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, Res, UseBefore } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';

import { SUPPORTMANAGEMENT_NAMESPACE } from '@/config';
import { apiServiceName } from '@/config/api-config';
import {
  EventFilter,
  NotificationChannel,
  NotificationChannelTypeEnum,
  Subscriber,
  Subscription,
  SubscriptionTarget,
} from '@/data-contracts/supportmanagement/data-contracts';
import { RequestWithUser } from '@/interfaces/auth.interface';
import { User } from '@/interfaces/users.interface';
import authMiddleware from '@/middlewares/auth.middleware';
import { validationMiddleware } from '@/middlewares/validation.middleware';
import ApiService from '@/services/api.service';
import { loadOrCreateSubscriber, sameSubscriptionTarget, subscriptionsUrl, SupportSubscriberApi } from '@/services/support-subscriber.service';
import { logger } from '@/utils/logger';

/**
 * A way to be notified. Deliberately without Support Management's `destination`: e-mail and SMS go to the address
 * and number the account has, never to one a request names, so an errand is not sent to a private address.
 */
class NotificationChannelDto {
  @IsEnum(NotificationChannelTypeEnum)
  type!: NotificationChannelTypeEnum;
}

class EventFilterDto {
  @IsString()
  type!: EventFilter['type'];
  @IsString()
  @IsOptional()
  subtype?: string;
}

class SubscriptionTargetDto {
  @IsString()
  type!: SubscriptionTarget['type'];
  @IsString()
  @IsOptional()
  id?: string;
}

/**
 * Patchable parts of a subscriber. `identifier` is deliberately absent: it identifies who receives
 * the notifications and is derived from the session, never from the request body.
 */
export class SubscriberUpdateDto {
  @IsString()
  @IsOptional()
  name?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @TypeTransformer(() => NotificationChannelDto)
  @IsOptional()
  channels?: NotificationChannelDto[];
  @IsArray()
  @ValidateNested({ each: true })
  @TypeTransformer(() => EventFilterDto)
  @IsOptional()
  eventFilters?: EventFilterDto[];
  @IsString()
  @IsOptional()
  pausedFrom?: string;
  @IsString()
  @IsOptional()
  pausedUntil?: string;
}

class SubscriptionCreateDto {
  @ValidateNested()
  @TypeTransformer(() => SubscriptionTargetDto)
  target!: SubscriptionTargetDto;
  @IsArray()
  @ValidateNested({ each: true })
  @TypeTransformer(() => EventFilterDto)
  @IsOptional()
  eventFilters?: EventFilterDto[];
  @IsString()
  @IsOptional()
  expiresAt?: string;
}

/**
 * The channels to store: each kind once, and always the one in Draken. Choosing e-mail or SMS adds to the
 * notifications in Draken; it does not replace them.
 */
const withInAppChannel = (channels: readonly NotificationChannelDto[]): NotificationChannel[] =>
  [...new Set([NotificationChannelTypeEnum.INTERNAL, ...channels.map(channel => channel.type)])].map(type => ({ type }));

@Controller()
export class SupportSubscriptionController {
  private apiService = new ApiService();
  private namespace = SUPPORTMANAGEMENT_NAMESPACE;
  private SERVICE = apiServiceName('supportmanagement');

  /** In-flight resolves, keyed by municipality and user. */
  private pendingSubscribers = new Map<string, Promise<Subscriber>>();

  /**
   * Resolve the subscriber belonging to the logged in user, creating it on first use.
   *
   * The subscriber is the anchor every subscription hangs off, so the frontend would otherwise have
   * to bootstrap it explicitly before it could subscribe to anything. Creating it lazily here keeps
   * that ceremony out of the client and makes every subscription call safe to fire blindly.
   *
   * Concurrent calls share one resolve: the errand page reads the subscriptions while the follow
   * button may be subscribing, which would otherwise create two subscribers on a user's first visit.
   */
  private resolveSubscriber(municipalityId: string, user: User): Promise<Subscriber> {
    const key = `${municipalityId}:${user.username}`;
    const pending = this.pendingSubscribers.get(key);
    if (pending) {
      return pending;
    }

    const resolving = loadOrCreateSubscriber(this.subscriberApi(), municipalityId, { account: user.username, name: user.name }, user).finally(() => {
      this.pendingSubscribers.delete(key);
    });
    this.pendingSubscribers.set(key, resolving);
    return resolving;
  }

  /** Built per call from the controller's own collaborators, so a test that replaces `apiService` reaches it too. */
  private subscriberApi(): SupportSubscriberApi {
    return { apiService: this.apiService, service: this.SERVICE, namespace: this.namespace };
  }

  private subscriptionsUrl(municipalityId: string, subscriberId: string): string {
    return subscriptionsUrl(this.subscriberApi(), municipalityId, subscriberId);
  }

  @Get('/supportsubscribers/:municipalityId/me')
  @OpenAPI({ summary: 'Get the subscriber for the logged in user, creating it if needed' })
  @UseBefore(authMiddleware)
  async fetchMySubscriber(@Req() req: RequestWithUser, @Param('municipalityId') municipalityId: string, @Res() response: any): Promise<Subscriber> {
    const subscriber = await this.resolveSubscriber(municipalityId, req.user);
    return response.status(200).send(subscriber);
  }

  @Patch('/supportsubscribers/:municipalityId/me')
  @OpenAPI({ summary: 'Update notification settings for the logged in user' })
  @UseBefore(authMiddleware, validationMiddleware(SubscriberUpdateDto, 'body'))
  async updateMySubscriber(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Body() data: SubscriberUpdateDto,
    @Res() response: any,
  ): Promise<Subscriber> {
    const subscriber = await this.resolveSubscriber(municipalityId, req.user);
    const url = `${this.SERVICE}/${municipalityId}/${this.namespace}/subscribers/${subscriber.id}`;
    const update: Partial<Subscriber> = data.channels ? { ...data, channels: withInAppChannel(data.channels) } : { ...data };
    const res = await this.apiService.patch<Subscriber, Partial<Subscriber>>({ url, data: update }, req.user).catch(e => {
      logger.error('Error when updating subscriber');
      logger.error(e);
      throw e;
    });
    return response.status(200).send(res.data);
  }

  @Get('/supportsubscriptions/:municipalityId')
  @OpenAPI({ summary: 'List the subscriptions of the logged in user' })
  @UseBefore(authMiddleware)
  async fetchMySubscriptions(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Res() response: any,
  ): Promise<Subscription[]> {
    const subscriber = await this.resolveSubscriber(municipalityId, req.user);
    const url = this.subscriptionsUrl(municipalityId, subscriber.id!);
    const res = await this.apiService.get<Subscription[]>({ url }, req.user);
    return response.status(200).send(res.data ?? []);
  }

  /**
   * Create a subscription for the logged in user.
   *
   * Idempotent by design: Support Management subscribes the handler itself when an errand is
   * assigned, so following an errand the user already follows - or following twice from two tabs -
   * must not create a second subscription. Upstream documents no conflict response for duplicates,
   * so the existing subscriptions are compared here rather than relying on a status code.
   */
  @Post('/supportsubscriptions/:municipalityId')
  @HttpCode(201)
  @OpenAPI({ summary: 'Subscribe the logged in user to an errand or the namespace' })
  @UseBefore(authMiddleware, validationMiddleware(SubscriptionCreateDto, 'body'))
  async createSubscription(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Body() data: SubscriptionCreateDto,
    @Res() response: any,
  ): Promise<Subscription> {
    const subscriber = await this.resolveSubscriber(municipalityId, req.user);
    const url = this.subscriptionsUrl(municipalityId, subscriber.id!);

    const existing = await this.apiService.get<Subscription[]>({ url }, req.user);
    const alreadySubscribed = (existing.data ?? []).find(subscription => sameSubscriptionTarget(subscription.target, data.target));
    if (alreadySubscribed) {
      return response.status(200).send(alreadySubscribed);
    }

    const created = await this.apiService.post<Subscription, SubscriptionCreateDto>({ url, data }, req.user).catch(e => {
      logger.error('Error when creating subscription');
      logger.error(e);
      throw e;
    });
    if (created.data?.id) {
      return response.status(201).send(created.data);
    }

    const reread = await this.apiService.get<Subscription[]>({ url }, req.user);
    const subscription = (reread.data ?? []).find(s => sameSubscriptionTarget(s.target, data.target));
    return response.status(201).send(subscription ?? null);
  }

  @Delete('/supportsubscriptions/:municipalityId/:subscriptionId')
  @OpenAPI({ summary: 'Remove a subscription belonging to the logged in user' })
  @UseBefore(authMiddleware)
  async deleteSubscription(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Param('subscriptionId') subscriptionId: string,
    @Res() response: any,
  ): Promise<void> {
    const subscriber = await this.resolveSubscriber(municipalityId, req.user);
    const url = `${this.subscriptionsUrl(municipalityId, subscriber.id!)}/${subscriptionId}`;
    await this.apiService.delete({ url }, req.user).catch(e => {
      logger.error('Error when deleting subscription');
      logger.error(e);
      throw e;
    });
    return response.status(204).send();
  }
}
