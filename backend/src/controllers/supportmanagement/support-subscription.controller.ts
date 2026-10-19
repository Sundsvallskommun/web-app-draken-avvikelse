import { Type as TypeTransformer } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Body, Controller, Get, Patch, Req, Res, UseBefore } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';

import { MUNICIPALITY_ID, SUPPORTMANAGEMENT_NAMESPACE } from '@/config';
import { apiServiceName } from '@/config/api-config';
import { EventFilter, NotificationChannel, NotificationChannelTypeEnum, Subscriber } from '@/data-contracts/supportmanagement/data-contracts';
import { RequestWithUser } from '@/interfaces/auth.interface';
import { User } from '@/interfaces/users.interface';
import authMiddleware from '@/middlewares/auth.middleware';
import { validationMiddleware } from '@/middlewares/validation.middleware';
import ApiService from '@/services/api.service';
import { loadOrCreateSubscriber, SupportSubscriberApi } from '@/services/support-subscriber.service';
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
   * Resolve the subscriber belonging to the logged in user, creating it on first use, so Notiser has
   * channels to read and save before anyone has made the user follow an errand.
   *
   * Concurrent calls share one resolve: two tabs opening Notiser at once would otherwise create two
   * subscribers on a user's first visit.
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

  @Get('/supportsubscribers/me')
  @OpenAPI({ summary: 'Get the subscriber for the logged in user, creating it if needed' })
  @UseBefore(authMiddleware)
  async fetchMySubscriber(@Req() req: RequestWithUser, @Res() response: any): Promise<Subscriber> {
    const subscriber = await this.resolveSubscriber(MUNICIPALITY_ID, req.user);
    return response.status(200).send(subscriber);
  }

  @Patch('/supportsubscribers/me')
  @OpenAPI({ summary: 'Update notification settings for the logged in user' })
  @UseBefore(authMiddleware, validationMiddleware(SubscriberUpdateDto, 'body'))
  async updateMySubscriber(@Req() req: RequestWithUser, @Body() data: SubscriberUpdateDto, @Res() response: any): Promise<Subscriber> {
    const subscriber = await this.resolveSubscriber(MUNICIPALITY_ID, req.user);
    const url = `${this.SERVICE}/${MUNICIPALITY_ID}/${this.namespace}/subscribers/${subscriber.id}`;
    const update: Partial<Subscriber> = data.channels ? { ...data, channels: withInAppChannel(data.channels) } : { ...data };
    const res = await this.apiService.patch<Subscriber, Partial<Subscriber>>({ url, data: update }, req.user).catch(e => {
      logger.error('Error when updating subscriber');
      logger.error(e);
      throw e;
    });
    return response.status(200).send(res.data);
  }
}
