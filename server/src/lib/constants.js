export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  EMPLOYEE: 'EMPLOYEE',
};

export const DEPT_STATUS = { ACTIVE: 'ACTIVE', COMING_SOON: 'COMING_SOON' };

export const SUBMISSION_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
};

export const ATTENDANCE_STATUS = {
  PRESENT: 'PRESENT',
  ABSENT: 'ABSENT',
  LEAVE: 'LEAVE',
  HALF_DAY: 'HALF_DAY',
  WFH: 'WFH',
  HOLIDAY: 'HOLIDAY',
};

/** Days that pay in full when salary is MONTHLY. */
export const PAID_ATTENDANCE = ['PRESENT', 'WFH', 'HOLIDAY', 'LEAVE'];

export const LEAVE_TYPES = [
  'SICK',
  'URGENT',
  'CASUAL',
  'EMERGENCY',
  'PAID',
  'UNPAID',
  'HALF_DAY',
  'WFH',
  'OTHER',
];

/** Leave types that still pay (Section 13.4 / assumption noted in README). */
export const PAID_LEAVE_TYPES = ['SICK', 'PAID', 'WFH', 'CASUAL'];

export const QUESTION_TYPES = { NUMBER: 'NUMBER', CHECK_FAIL: 'CHECK_FAIL' };

/** Work-from-home submissions close at 22:00 local time (Section 11.2). */
export const WFH_CUTOFF_HOUR = 22;

/**
 * Every switchable Admin permission. The Super Admin flips these per admin
 * account (Section 7.1). A permission that is off hides the section entirely.
 */
export const PERMISSIONS = [
  { key: 'employees.view', group: 'People', label: 'View all employees' },
  { key: 'employees.create', group: 'People', label: 'Create accounts' },
  { key: 'employees.edit', group: 'People', label: 'Edit employee details' },
  { key: 'employees.deactivate', group: 'People', label: 'Deactivate / reactivate accounts' },
  { key: 'employees.resetPassword', group: 'People', label: "Reset someone else's password" },

  { key: 'salary.view', group: 'Money', label: 'View salary & payroll' },
  { key: 'salary.edit', group: 'Money', label: 'Edit salary / incentive / bonus / deduction' },
  { key: 'salary.export', group: 'Money', label: 'Export payroll' },

  { key: 'attendance.view', group: 'Attendance', label: 'View attendance' },
  { key: 'attendance.edit', group: 'Attendance', label: 'Edit / correct attendance' },
  { key: 'holidays.manage', group: 'Attendance', label: 'Declare holidays' },

  { key: 'work.view', group: 'Work', label: 'View work reports' },
  { key: 'work.approve', group: 'Work', label: 'Approve / reject work submissions' },
  { key: 'work.backfill', group: 'Work', label: "Backfill someone's work" },

  { key: 'tasks.manage', group: 'Tasks', label: 'Assign tasks' },
  { key: 'tasks.approve', group: 'Tasks', label: 'Approve task completions' },

  { key: 'leave.approve', group: 'Leave', label: 'Approve / reject leave' },

  { key: 'notices.manage', group: 'Communication', label: 'Publish notices' },
  { key: 'notices.readReceipts', group: 'Communication', label: 'See who read a notice' },
  { key: 'queries.answer', group: 'Communication', label: 'Answer employee questions' },

  { key: 'departments.view', group: 'Reporting', label: 'View department totals & targets' },
  { key: 'audit.view', group: 'Reporting', label: 'View history log' },
];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

/**
 * Section 7.2 — hard limits. No one, not even the Super Admin, can grant these
 * to an Admin. Enforced in code, never as data.
 */
export const HARD_LIMITS = [
  'An Admin can never edit their own salary, incentive, bonus or deduction',
  'An Admin can never edit their own attendance',
  'An Admin can never approve their own leave request',
  'An Admin can never approve their own work submission',
  "An Admin can never change a Manager's salary",
  'An Admin can never see or modify the backup Super Admin account',
];

export const AUDIT = {
  LOGIN: 'LOGIN',
  ACCOUNT_CREATED: 'ACCOUNT_CREATED',
  ACCOUNT_UPDATED: 'ACCOUNT_UPDATED',
  ACCOUNT_DEACTIVATED: 'ACCOUNT_DEACTIVATED',
  ACCOUNT_REACTIVATED: 'ACCOUNT_REACTIVATED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PASSWORD_RESET: 'PASSWORD_RESET',
  PERMISSIONS_CHANGED: 'PERMISSIONS_CHANGED',
  DEPARTMENT_CREATED: 'DEPARTMENT_CREATED',
  DEPARTMENT_UPDATED: 'DEPARTMENT_UPDATED',
  AUTOPILOT_TOGGLED: 'AUTOPILOT_TOGGLED',
  JOB_ROLE_CREATED: 'JOB_ROLE_CREATED',
  JOB_ROLE_UPDATED: 'JOB_ROLE_UPDATED',
  QUESTION_UPDATED: 'QUESTION_UPDATED',
  WORK_SUBMITTED: 'WORK_SUBMITTED',
  WORK_UPDATED: 'WORK_UPDATED',
  WORK_BACKFILLED: 'WORK_BACKFILLED',
  WORK_APPROVED: 'WORK_APPROVED',
  WORK_REJECTED: 'WORK_REJECTED',
  ATTENDANCE_MARKED: 'ATTENDANCE_MARKED',
  ATTENDANCE_CORRECTED: 'ATTENDANCE_CORRECTED',
  HOLIDAY_DECLARED: 'HOLIDAY_DECLARED',
  HOLIDAY_REMOVED: 'HOLIDAY_REMOVED',
  LEAVE_REQUESTED: 'LEAVE_REQUESTED',
  LEAVE_APPROVED: 'LEAVE_APPROVED',
  LEAVE_REJECTED: 'LEAVE_REJECTED',
  TASK_CREATED: 'TASK_CREATED',
  TASK_RESPONDED: 'TASK_RESPONDED',
  TASK_APPROVED: 'TASK_APPROVED',
  TASK_REJECTED: 'TASK_REJECTED',
  NOTICE_PUBLISHED: 'NOTICE_PUBLISHED',
  NOTICE_READ: 'NOTICE_READ',
  QUERY_RAISED: 'QUERY_RAISED',
  QUERY_ANSWERED: 'QUERY_ANSWERED',
  SALARY_UPDATED: 'SALARY_UPDATED',
  PAY_ITEM_ADDED: 'PAY_ITEM_ADDED',
  PAY_ITEM_REMOVED: 'PAY_ITEM_REMOVED',
  MONTH_LOCKED: 'MONTH_LOCKED',
  MONTH_UNLOCKED: 'MONTH_UNLOCKED',
  PAYROLL_EXPORTED: 'PAYROLL_EXPORTED',
  TARGET_UPDATED: 'TARGET_UPDATED',
};
