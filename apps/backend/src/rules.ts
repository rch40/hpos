import type { ActivityEvent, PipelineStatus, Prospect, Task, Unit } from '@hpos/contracts';

type AutomationContext = {
  prospect: Prospect;
  units: Unit[];
  openTasks: Task[];
  now: Date;
};

export type AutomationResult = {
  tasksToCreate: Array<Omit<Task, 'id' | 'state'>>;
  taskIdsToClose: string[];
  unitUpdates: Array<Pick<Unit, 'id' | 'status'>>;
  events: Array<Omit<ActivityEvent, 'id' | 'timestamp'>>;
};

export type StatusRule = {
  status: PipelineStatus;
  apply: (context: AutomationContext) => AutomationResult;
};

const emptyResult = (): AutomationResult => ({
  tasksToCreate: [],
  taskIdsToClose: [],
  unitUpdates: [],
  events: []
});

const addDays = (date: Date, days: number): string => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString();
};

const createFollowUpTask = (
  prospect: Prospect,
  title: string,
  dueDate: string
): Omit<Task, 'id' | 'state'> => ({
  title,
  dueDate,
  assignee: prospect.assignee,
  prospectId: prospect.id
});

const closeOpenTasks = (context: AutomationContext): string[] =>
  context.openTasks.filter((task) => task.state === 'open').map((task) => task.id);

export const statusRules: StatusRule[] = [
  {
    status: 'contacted',
    apply: ({ prospect, now }) => ({
      ...emptyResult(),
      tasksToCreate: [
        createFollowUpTask(prospect, `Send tour availability to ${prospect.name}`, addDays(now, 2))
      ]
    })
  },
  {
    status: 'toured',
    apply: ({ prospect, now }) => ({
      ...emptyResult(),
      tasksToCreate: [createFollowUpTask(prospect, 'Send application link', addDays(now, 1))]
    })
  },
  {
    status: 'application',
    apply: ({ prospect, now }) => ({
      ...emptyResult(),
      tasksToCreate: [createFollowUpTask(prospect, 'Review application', addDays(now, 3))]
    })
  },
  {
    status: 'leased',
    apply: (context) => ({
      ...emptyResult(),
      taskIdsToClose: closeOpenTasks(context),
      unitUpdates: context.prospect.assignedUnitId
        ? [{ id: context.prospect.assignedUnitId, status: 'leased' }]
        : []
    })
  },
  {
    status: 'lost',
    apply: (context) => ({
      ...emptyResult(),
      taskIdsToClose: closeOpenTasks(context)
    })
  }
];

export const applyStatusRules = (
  nextStatus: PipelineStatus,
  context: AutomationContext
): AutomationResult => {
  const rule = statusRules.find((candidate) => candidate.status === nextStatus);
  const result = rule ? rule.apply(context) : emptyResult();

  return {
    ...result,
    events: [
      {
        type: 'prospect_status_changed',
        prospectId: context.prospect.id,
        unitId: context.prospect.assignedUnitId,
        summary: `${context.prospect.name} moved to ${nextStatus}`
      },
      ...result.events
    ]
  };
};
