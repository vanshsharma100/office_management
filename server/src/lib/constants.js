export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  EMPLOYEE: 'EMPLOYEE',
};

/**
 * Roles whose attendance is not kept at all.
 *
 * The owner runs the office rather than punches into it. Listing them on the
 * daily board was the visible half of the problem; the real one was that
 * closing a day wrote them an ABSENT row like anyone else, and that row is
 * what salary reads. Both the board and the derivation read this list, so a
 * name can never appear in one and be judged by the other.
 */
export const ATTENDANCE_EXEMPT_ROLES = [ROLES.SUPER_ADMIN];

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
  WEEKLY_OFF: 'WEEKLY_OFF',
};

/**
 * Days that pay in full when salary is MONTHLY.
 * LEAVE is deliberately absent — whether a leave pays is decided by the
 * approver on the request itself (LeaveRequest.isPaid), not by the day.
 */
export const PAID_ATTENDANCE = ['PRESENT', 'WFH', 'HOLIDAY', 'WEEKLY_OFF'];

/**
 * A day with no attendance row is only "absent" once the sync agent has
 * confirmed it collected that date. Until then it is NA and costs nobody
 * anything — see services/attendanceDerive.js.
 */
export const ATTENDANCE_NA = 'NA';

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

/**
 * Section 13.4 — the house rule for what a leave decision costs.
 *
 * The approver tags an approved leave "Paid" or "Unpaid", and in this office
 * those words describe who carries the day:
 *
 *   Paid   → the company pays for the day off, so the day comes out of the
 *            employee's salary at the day rate.
 *   Unpaid → the day is not charged to anyone. Salary is untouched.
 *
 * That is the reverse of the usual payroll convention, so every label the
 * approver sees spells out the money rather than relying on the word alone.
 * Stored as LeaveRequest.isPaid; `true` is the only value that deducts.
 *
 * The types below merely pre-select "Paid" in the approve dialog. The approver
 * can always switch it, and the decision is what counts — never the type.
 */
export const DEDUCTING_LEAVE_TYPES = ['URGENT', 'EMERGENCY', 'PAID'];

/**
 * The attendance status an approved leave puts on a day.
 *
 * Two places write it — the approval itself (routes/leave.js) and the nightly
 * rebuild from the punch machine (services/attendanceDerive.js). They must
 * agree, or the rebuild flattens an approved WFH or half day into a plain
 * LEAVE and the day silently changes what it pays.
 */
export function attendanceStatusForLeave(leaveType) {
  if (leaveType === 'WFH') return ATTENDANCE_STATUS.WFH;
  if (leaveType === 'HALF_DAY') return ATTENDANCE_STATUS.HALF_DAY;
  return ATTENDANCE_STATUS.LEAVE;
}

/**
 * Statuses that mean the person did not work that day. Punch-derived fields —
 * check in / out, hours, lateness — are meaningless on these and must be
 * cleared, or an admin marking someone absent still pays them for the hours
 * the machine recorded and fines them for arriving late to a day off.
 */
export const NON_WORKING_STATUS = [
  ATTENDANCE_STATUS.ABSENT,
  ATTENDANCE_STATUS.LEAVE,
  ATTENDANCE_STATUS.HOLIDAY,
  ATTENDANCE_STATUS.WEEKLY_OFF,
];

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
  { key: 'health.manage', group: 'Reporting', label: 'Fill employee health scorecards' },
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
  ATTENDANCE_RECALCULATED: 'ATTENDANCE_RECALCULATED',
  ATTENDANCE_POLICY_UPDATED: 'ATTENDANCE_POLICY_UPDATED',
  PRESENCE_REQUESTED: 'PRESENCE_REQUESTED',
  PRESENCE_APPROVED: 'PRESENCE_APPROVED',
  PRESENCE_REJECTED: 'PRESENCE_REJECTED',
  SYNC_AGENT_CREATED: 'SYNC_AGENT_CREATED',
  SYNC_AGENT_REVOKED: 'SYNC_AGENT_REVOKED',
  BIOMETRIC_MAPPED: 'BIOMETRIC_MAPPED',
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
  BRANDING_UPDATED: 'BRANDING_UPDATED',
  WEEKLY_REPORT_SUBMITTED: 'WEEKLY_REPORT_SUBMITTED',
  WEEKLY_REPORT_UPDATED: 'WEEKLY_REPORT_UPDATED',
  WEEKLY_REPORT_CONFIGURED: 'WEEKLY_REPORT_CONFIGURED',
  PROFILE_UPDATED: 'PROFILE_UPDATED',
  REPORT_EXPORTED: 'REPORT_EXPORTED',
  DATA_RESET: 'DATA_RESET',
  PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_COMPLETED: 'PASSWORD_RESET_COMPLETED',
  RECOVERY_EMAIL_SET: 'RECOVERY_EMAIL_SET',
  HEALTH_UPDATED: 'HEALTH_UPDATED',
};
