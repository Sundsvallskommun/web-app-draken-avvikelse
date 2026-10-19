import { Type as TypeTransformer } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsString, ValidateNested } from 'class-validator';
import { randomUUID } from 'crypto';
import { Body, Controller, Get, Param, Patch, Put, QueryParam, Req, Res, UseBefore } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';

import { SUPPORTMANAGEMENT_NAMESPACE } from '@/config';
import { apiServiceName } from '@/config/api-config';
import {
  IdentifierTypeEnum,
  PageSubscriberNotification,
  SubscriberNotification,
  SubscriberNotificationEvent,
} from '@/data-contracts/supportmanagement/data-contracts';
import { RequestWithUser } from '@/interfaces/auth.interface';
import { User } from '@/interfaces/users.interface';
import authMiddleware from '@/middlewares/auth.middleware';
import { validationMiddleware } from '@/middlewares/validation.middleware';
import ApiService from '@/services/api.service';
import { logger } from '@/utils/logger';
import { currentRequestGroupId } from '@/utils/request-group';

/**
 * One thing that happened on an errand, as the frontend consumes it.
 *
 * Upstream aggregates every event since the last acknowledgement onto a single notification, so a
 * notification carries a list of these rather than one flat event of its own.
 */
export class SupportNotificationEventDto {
  @IsString()
  created?: string;
  @IsString()
  eventType?: string;
  @IsString()
  subType?: string;
  @IsString()
  description?: string;
}

/**
 * A notification as the frontend consumes it.
 *
 * One notification per errand, holding everything that has happened on it since the user last
 * acknowledged. The panel renders a notification as a single row, so no grouping is needed on the
 * client any more.
 */
export class SupportNotificationDto {
  @IsString()
  id!: string;
  @IsString()
  created!: string;
  /** Timestamp of acknowledgement, absent while the notification is unacknowledged. */
  @IsString()
  acknowledged?: string;
  @IsString()
  errandId!: string;
  @IsString()
  errandNumber!: string;
  /**
   * Events since the last acknowledgement, newest first. Can be empty — upstream does not guarantee
   * an event for every notification, and consumers have to stay readable when it is.
   */
  @IsArray()
  @ValidateNested({ each: true })
  @TypeTransformer(() => SupportNotificationEventDto)
  events!: SupportNotificationEventDto[];
}

class AcknowledgeNotificationsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids!: string[];
}

export class AcknowledgeResultDto {
  acknowledged!: string[];
  failed!: string[];
}

/**
 * Newest first. Upstream does not promise an order, and the panel takes the first event as the one
 * that represents the notification, so the order is settled here rather than in every consumer.
 */
const byCreatedDesc = (a: SubscriberNotificationEvent, b: SubscriberNotificationEvent): number =>
  new Date(b.created ?? 0).getTime() - new Date(a.created ?? 0).getTime();

/** How many notifications each upstream page carries, unless the caller asks for a page of its own. */
const NOTIFICATION_PAGE_SIZE = 100;

const toNotificationDto = (notification: SubscriberNotification): SupportNotificationDto => ({
  id: notification.id!,
  created: notification.created!,
  acknowledged: notification.acknowledged,
  errandId: notification.errandId!,
  errandNumber: notification.errandNumber!,
  events: [...(notification.events ?? [])].sort(byCreatedDesc).map(event => ({
    created: event.created,
    eventType: event.eventType,
    subType: event.subType,
    description: event.description,
  })),
});

@Controller()
export class SupportNotificationController {
  private apiService = new ApiService();
  private namespace = SUPPORTMANAGEMENT_NAMESPACE;
  SERVICE = apiServiceName('supportmanagement');

  private notificationsUrl(municipalityId: string, user: User): string {
    return `${this.SERVICE}/${municipalityId}/${this.namespace}/notifications/${IdentifierTypeEnum.AdAccount}/${user.username}`;
  }

  private async fetchNotificationPage(municipalityId: string, user: User, page: number, size: number): Promise<PageSubscriberNotification> {
    const query = new URLSearchParams({ page: String(page), size: String(size), sort: 'created,desc' }).toString();
    const res = await this.apiService.get<PageSubscriberNotification>({ url: `${this.notificationsUrl(municipalityId, user)}?${query}` }, user);
    return res.data ?? {};
  }

  /**
   * Every notification the user has. Upstream answers a page at a time and keeps an acknowledged notification
   * until it expires, so the first page is not the whole list: an errand's notification can sit on any page.
   * The pages are read until upstream has no more; a notification that moves to the next page while they are
   * read is kept once.
   */
  private async fetchAllNotifications(municipalityId: string, user: User): Promise<SubscriberNotification[]> {
    const notifications: SubscriberNotification[] = [];
    const seenIds = new Set<string>();
    for (let page = 0; ; page += 1) {
      const { content = [], totalPages = 1 } = await this.fetchNotificationPage(municipalityId, user, page, NOTIFICATION_PAGE_SIZE);
      for (const notification of content) {
        if (notification.id !== undefined && seenIds.has(notification.id)) continue;
        if (notification.id !== undefined) seenIds.add(notification.id);
        notifications.push(notification);
      }
      if (content.length === 0 || page + 1 >= totalPages) return notifications;
    }
  }

  /**
   * Acknowledge several notifications.
   *
   * Upstream only acknowledges one notification per call, so the fan-out lives here rather than in
   * the browser. The shared request-group id - the one the browser sent for its action, when it sent
   * one - ties the individual calls together as one operation in the upstream event log. Failures are collected instead of thrown so that a single bad id does
   * not discard the notifications that were acknowledged successfully.
   */
  private async acknowledgeMany(municipalityId: string, user: User, ids: string[]): Promise<AcknowledgeResultDto> {
    const requestGroupId = currentRequestGroupId() ?? randomUUID();
    const baseUrl = `${this.SERVICE}/${municipalityId}/${this.namespace}/notifications`;
    const results = await Promise.allSettled(
      ids.map(id =>
        // Acknowledging is the user reading; nobody following the errand is to hear of it.
        this.apiService.put(
          { url: `${baseUrl}/${id}/acknowledge`, headers: { 'X-Request-Group-Id': requestGroupId }, notifySubscribers: false },
          user,
        ),
      ),
    );

    const acknowledged: string[] = [];
    const failed: string[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        acknowledged.push(ids[index]);
      } else {
        failed.push(ids[index]);
        logger.error(`Failed to acknowledge notification ${ids[index]}: ${result.reason}`);
      }
    });
    return { acknowledged, failed };
  }

  @Get('/supportnotifications/:municipalityId')
  @OpenAPI({ summary: 'Get notifications for the logged in user' })
  @UseBefore(authMiddleware)
  async getSupportNotifications(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @QueryParam('page') page: number,
    @QueryParam('size') size: number,
    @Res() response: any,
  ): Promise<SupportNotificationDto[]> {
    // The panel asks for no page and gets them all; a caller that names a page or size gets that page.
    const notifications =
      page === undefined && size === undefined
        ? await this.fetchAllNotifications(municipalityId, req.user)
        : ((await this.fetchNotificationPage(municipalityId, req.user, page ?? 0, size ?? NOTIFICATION_PAGE_SIZE)).content ?? []);
    return response.status(200).send(notifications.map(toNotificationDto));
  }

  @Patch('/supportnotifications/:municipalityId/acknowledge')
  @OpenAPI({ summary: 'Acknowledge one or more notifications for the logged in user' })
  @UseBefore(authMiddleware, validationMiddleware(AcknowledgeNotificationsDto, 'body'))
  async acknowledgeSupportNotifications(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Body() data: AcknowledgeNotificationsDto,
    @Res() response: any,
  ): Promise<AcknowledgeResultDto> {
    const result = await this.acknowledgeMany(municipalityId, req.user, data.ids);
    return response.status(200).send(result);
  }

  /**
   * Acknowledge every notification the logged in user has for one errand, used when the errand is
   * opened from the overview. Upstream cannot filter notifications by errand, so the user's whole list is
   * read and filtered here, every page of it, before anything is acknowledged.
   */
  @Put('/supportnotifications/:municipalityId/:errandId/acknowledge-all')
  @OpenAPI({ summary: 'Acknowledge all notifications the logged in user has for an errand' })
  @UseBefore(authMiddleware)
  async acknowledgeAllForErrand(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Param('errandId') errandId: string,
    @Res() response: any,
  ): Promise<AcknowledgeResultDto> {
    const notifications = await this.fetchAllNotifications(municipalityId, req.user);
    const ids = notifications.filter(n => n.errandId === errandId && !n.acknowledged).map(n => n.id!);
    if (!ids.length) {
      return response.status(200).send({ acknowledged: [], failed: [] });
    }
    const result = await this.acknowledgeMany(municipalityId, req.user, ids);
    return response.status(200).send(result);
  }
}
