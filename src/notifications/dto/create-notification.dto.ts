import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export enum CreateNotificationType {
  EMAIL = 'EMAIL',
  IN_APP = 'IN_APP',
}

export class CreateNotificationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  userId: string;

  @IsEnum(CreateNotificationType)
  type: CreateNotificationType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(320)
  recipient: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  subject?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}
