import { Controller, Post, Param, Get, Body } from '@nestjs/common';
import { UserReq, Auth } from 'utils/decorators';
import { User } from '@backend/users/users.model';
import { RequestsRabbitMQService } from './services/requests-rabbitmq.service';
import { NotificationsService } from '@backend/notifications';
import { RequestsService } from './requests.service';
import { ObjectID } from 'mongodb';
import { IsString } from 'class-validator';
import { ProfilesService } from '@backend/profiles';
import { HelpRequest } from './requests.model';

class RequestBodyDto {
  @IsString()
  public profileId: string;
}

@Controller('v1/requests')
export class RequestsController {
  constructor(
    private requestsRabbitMQ: RequestsRabbitMQService,
    private requests: RequestsService,
    private profiles: ProfilesService,
    private notifications: NotificationsService
  ) {}

  @Auth()
  @Post()
  public async create(
    @UserReq() user: User,
    @Body() body: RequestBodyDto
  ): Promise<HelpRequest> {
    await this.profiles.validateProfileUserMatch({
      id: new ObjectID(body.profileId),
      userId: new ObjectID(user._id),
    });
    const request = await this.requests.createOne({
      status: 'pending',
      requesterProfileId: new ObjectID(body.profileId),
      type: 'misc',
    });
    await this.requestsRabbitMQ.sendToDispatchRequests({
      profileId: new ObjectID(body.profileId),
      requestId: new ObjectID(request._id),
    });
    return request;
  }

  @Auth()
  @Post(':id/cancel')
  public async cancel(
    @Param('id') id: string,
    @UserReq() user: User,
    @Body() body: RequestBodyDto
  ): Promise<void> {
    await this.profiles.validateProfileUserMatch({
      id: new ObjectID(body.profileId),
      userId: new ObjectID(user._id),
    });
    await this.requests.cancelOne(new ObjectID(id));
  }

  @Auth()
  @Post(':id/accept')
  public async accept(
    @Param('id') id: string,
    @Body() body: RequestBodyDto
  ): Promise<void> {
    await this.requests.validateRequestResponseMatch({
      id: new ObjectID(id),
      responseProfileId: new ObjectID(body.profileId),
    });
    await this.requests.acceptOne({
      id: new ObjectID(id),
      acceptorProfileId: new ObjectID(body.profileId),
    });
    this.requestsRabbitMQ.sendToAcceptRequests({ requestId: new ObjectID(id) });
  }

  @Get(':id')
  public async test(@Param('id') deviceId: string): Promise<void> {
    try {
      await this.notifications.send({
        registrationTokens: [deviceId],
        message: {
          title: 'dummy title',
          body: 'this is the message body.',
          icon: 'no-icon',
        },
      });
    } catch (err) {
      console.log('failed', { err });
    }
  }
}
