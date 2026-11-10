import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsController, AnalyticsService } from './analytics/analytics.controller';
import { MapController, MapService } from './map/map.controller';
import { AuditController } from './audit/audit.controller';
import { AuditService } from './audit/audit.service';
import { AuthGuard } from './auth/auth';
import { AuthController } from './auth/auth.controller';
import { OpsController } from './ops/ops.controller';
import { OpsService } from './ops/ops.service';
import { DictionaryController } from './dictionary/dictionary.controller';
import { HealthController } from './health.controller';
import { NOTAM_GENERATOR, RagGenerator, providerFromEnv } from './generator/generator';
import { RequestsController } from './requests/requests.controller';
import { RequestsService } from './requests/requests.service';
import { AuditLog, AuditLogSchema, NotamRequest, NotamRequestSchema, Region, RegionSchema, Setting, SettingSchema, User, UserSchema } from './requests/schemas';
import { UsersController } from './users/users.controller';
import { ProfileController } from './users/profile.controller';
import { RegionsController } from './regions/regions.controller';
import { SuggestController } from './suggest/suggest.controller';

@Module({})
export class AppModule {
  static register(o: { mongoUri: string; jwtSecret: string }): DynamicModule {
    return {
      module: AppModule,
      imports: [
        MongooseModule.forRoot(o.mongoUri),
        MongooseModule.forFeature([
          { name: User.name, schema: UserSchema },
          { name: NotamRequest.name, schema: NotamRequestSchema },
          { name: Setting.name, schema: SettingSchema },
          { name: Region.name, schema: RegionSchema },
          { name: AuditLog.name, schema: AuditLogSchema },
        ]),
        JwtModule.register({ global: true, secret: o.jwtSecret, signOptions: { expiresIn: '8h' } }),
      ],
      controllers: [AuthController, RequestsController, UsersController, ProfileController, SuggestController, HealthController, OpsController, AuditController, AnalyticsController, DictionaryController, MapController, RegionsController],
      providers: [RequestsService, OpsService, AuditService, AnalyticsService, MapService, { provide: NOTAM_GENERATOR, useFactory: () => new RagGenerator(providerFromEnv()) }, { provide: APP_GUARD, useClass: AuthGuard }],
    };
  }
}
