import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Role, Status } from '../workflow/workflow';

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true }) username: string;
  @Prop({ trim: true, default: '' }) name: string;
  @Prop({ required: true }) passwordHash: string;
  @Prop({ type: String, required: true, enum: ['ORIGINATOR', 'ATS', 'PIA', 'NOF', 'ADMIN'] }) role: Role;
  @Prop({ default: true }) active: boolean;
  @Prop() lastLoginAt: Date;
}
export const UserSchema = SchemaFactory.createForClass(User);

// Jejak audit append-only: tidak ada endpoint yang mengubah atau menghapus. Tidak memuat password.
@Schema({ collection: 'auditlogs' })
export class AuditLog {
  @Prop({ default: () => new Date(), index: true }) at: Date;
  @Prop({ required: true, index: true }) actor: string;
  @Prop() role: string;
  @Prop({ required: true, index: true }) action: string;
  @Prop() target: string;
  @Prop({ required: true }) summary: string;
  @Prop({ type: Object }) detail: Record<string, unknown>;
  @Prop() ip: string;
}
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// Pengaturan operasional (mis. gerbang generate) yang bertahan setelah restart.
@Schema()
export class Setting {
  @Prop({ required: true, unique: true }) key: string;
  @Prop({ type: Object }) value: Record<string, unknown>;
}
export const SettingSchema = SchemaFactory.createForClass(Setting);

@Schema({ _id: false })
export class Version {
  @Prop({ required: true }) no: number;
  @Prop({ required: true }) freeText: string;
  @Prop({ required: true }) generated: string;
  @Prop() provider: string;
  @Prop() model: string;
  @Prop({ type: [String], default: [] }) corrections: string[];
  @Prop({ type: Object }) validation: { status: string; issues: { code: string; level: string; message: string }[] };
  @Prop() ms: number;
  @Prop({ default: () => new Date() }) createdAt: Date;
}
export const VersionSchema = SchemaFactory.createForClass(Version);

// Riwayat transisi (append-only); juga berfungsi sebagai audit workflow.
@Schema({ _id: false })
export class WorkflowEvent {
  @Prop({ required: true }) actor: string;
  @Prop({ required: true }) role: string;
  @Prop({ required: true }) action: string;
  @Prop({ required: true }) from: string;
  @Prop({ required: true }) to: string;
  @Prop() note: string;
  @Prop({ default: () => new Date() }) at: Date;
}
export const WorkflowEventSchema = SchemaFactory.createForClass(WorkflowEvent);

@Schema({ timestamps: true })
export class NotamRequest {
  @Prop({ required: true, unique: true }) formNo: string;
  @Prop({ required: true }) airport: string;
  @Prop({ required: true }) originator: string;
  @Prop({ type: String, required: true, default: 'DRAFT' }) status: Status;
  @Prop() route: string;
  @Prop({ default: 0 }) piaRevisionCount: number;
  @Prop({ type: [VersionSchema], default: [] }) versions: Version[];
  @Prop({ type: [WorkflowEventSchema], default: [] }) events: WorkflowEvent[];
}
export const NotamRequestSchema = SchemaFactory.createForClass(NotamRequest);
