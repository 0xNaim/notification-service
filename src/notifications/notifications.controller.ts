import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CreateNotificationDto } from './dto/create-notification.dto.js';
import { NotificationRateLimitGuard } from './notification-rate-limit.guard.js';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationService: NotificationsService) {}

  @Post()
  @UseGuards(NotificationRateLimitGuard)
  create(@Body() dto: CreateNotificationDto) {
    return this.notificationService.create(dto);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.notificationService.findById(id);
  }
}
