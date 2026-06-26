import { z } from 'zod';

export const IdSchema = z.string().uuid();
export const IsoDateTimeSchema = z.string().datetime();

export const UnitStatusSchema = z.enum(['available', 'held', 'leased']);
export const PipelineStatusSchema = z.enum([
  'new',
  'contacted',
  'tour_scheduled',
  'toured',
  'application',
  'leased',
  'lost'
]);
export const TourOutcomeSchema = z.enum(['completed', 'no_show', 'cancelled']);
export const TaskStateSchema = z.enum(['open', 'done']);
export const ActivityEventTypeSchema = z.enum([
  'prospect_created',
  'prospect_status_changed',
  'task_created',
  'task_closed',
  'tour_scheduled',
  'tour_outcome_recorded',
  'unit_status_changed'
]);

export const UnitSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  status: UnitStatusSchema
});

export const ContactInfoSchema = z.object({
  email: z.string().email(),
  phone: z.string().min(10)
});

export const ProspectSchema = z.object({
  id: IdSchema,
  name: z.string().min(2),
  contact: ContactInfoSchema,
  assignedUnitId: IdSchema.nullable(),
  status: PipelineStatusSchema,
  assignee: z.string().min(1),
  nextTourAt: IsoDateTimeSchema.nullable().optional()
});

export const TourSchema = z.object({
  id: IdSchema,
  prospectId: IdSchema,
  unitId: IdSchema,
  scheduledAt: IsoDateTimeSchema,
  outcome: TourOutcomeSchema.nullable()
});

export const TaskSchema = z.object({
  id: IdSchema,
  title: z.string().min(1),
  dueDate: IsoDateTimeSchema,
  assignee: z.string().min(1),
  prospectId: IdSchema,
  state: TaskStateSchema
});

export const ActivityEventSchema = z.object({
  id: IdSchema,
  type: ActivityEventTypeSchema,
  timestamp: IsoDateTimeSchema,
  prospectId: IdSchema.nullable(),
  unitId: IdSchema.nullable(),
  summary: z.string().min(1)
});

export const CreateUnitRequestSchema = UnitSchema.omit({ id: true });
export const UpdateUnitRequestSchema = CreateUnitRequestSchema.partial();

export const CreateProspectRequestSchema = ProspectSchema.omit({
  id: true,
  status: true,
  assignedUnitId: true,
}).extend({
  status: PipelineStatusSchema.optional(),
  assignedUnitId: IdSchema.nullable().optional(),
});

export const UpdateProspectRequestSchema = ProspectSchema.omit({ id: true }).partial();

export const ProspectFilterSchema = z.object({
  search: z.string().optional(),
  status: PipelineStatusSchema.optional(),
  unitId: IdSchema.optional(),
  assignee: z.string().optional(),
});

export const UpdateProspectStatusRequestSchema = z.object({
  status: PipelineStatusSchema
});

export const CreateTourRequestSchema = TourSchema.omit({
  id: true,
  outcome: true
});

export const RecordTourOutcomeRequestSchema = z.object({
  outcome: TourOutcomeSchema
});

export const RescheduleTourRequestSchema = z.object({
  scheduledAt: IsoDateTimeSchema
});

export const UpdateTaskStateRequestSchema = z.object({
  state: TaskStateSchema
});

export const CreateTaskRequestSchema = TaskSchema.omit({ id: true, state: true });

export type UnitStatus = z.infer<typeof UnitStatusSchema>;
export type PipelineStatus = z.infer<typeof PipelineStatusSchema>;
export type TourOutcome = z.infer<typeof TourOutcomeSchema>;
export type TaskState = z.infer<typeof TaskStateSchema>;
export type ActivityEventType = z.infer<typeof ActivityEventTypeSchema>;
export type Unit = z.infer<typeof UnitSchema>;
export type ContactInfo = z.infer<typeof ContactInfoSchema>;
export type Prospect = z.infer<typeof ProspectSchema>;
export type Tour = z.infer<typeof TourSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type ActivityEvent = z.infer<typeof ActivityEventSchema>;
export type CreateUnitRequest = z.infer<typeof CreateUnitRequestSchema>;
export type UpdateUnitRequest = z.infer<typeof UpdateUnitRequestSchema>;
export type CreateProspectRequest = z.infer<typeof CreateProspectRequestSchema>;
export type UpdateProspectRequest = z.infer<typeof UpdateProspectRequestSchema>;
export type ProspectFilter = z.infer<typeof ProspectFilterSchema>;
export type UpdateProspectStatusRequest = z.infer<typeof UpdateProspectStatusRequestSchema>;
export type CreateTourRequest = z.infer<typeof CreateTourRequestSchema>;
export type RecordTourOutcomeRequest = z.infer<typeof RecordTourOutcomeRequestSchema>;
export type RescheduleTourRequest = z.infer<typeof RescheduleTourRequestSchema>;
export type UpdateTaskStateRequest = z.infer<typeof UpdateTaskStateRequestSchema>;
export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;