import { ROLES } from '../lib/constants.js';

const parseList = (value) => {
  try {
    const parsed = JSON.parse(value ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/** Everything the client is allowed to know about a user. Never the hash. */
export function publicUser(user) {
  if (!user) return null;
  const permissions = user.permissionList ?? parseList(user.permissions);
  return {
    id: user.id,
    employeeId: user.employeeId,
    biometricId: user.biometricId, // the punch UID this person is linked to
    username: user.username,
    name: user.name,
    role: user.role,
    email: user.email,
    phone: user.phone,
    address: user.address,
    emergencyContact: user.emergencyContact,
    recoveryEmail: user.recoveryEmail,
    photoUrl: user.photoUrl,
    joinDate: user.joinDate,
    isActive: user.isActive,
    isManager: user.isManager,
    isHidden: user.isHidden,
    departmentId: user.departmentId,
    department: user.department
      ? {
          id: user.department.id,
          name: user.department.name,
          nameHi: user.department.nameHi,
          code: user.department.code,
          status: user.department.status,
          autopilot: user.department.autopilot,
          color: user.department.color,
          icon: user.department.icon,
        }
      : null,
    jobRoles: (user.jobRoles ?? []).map((l) => ({
      id: l.jobRole?.id ?? l.jobRoleId,
      name: l.jobRole?.name,
      nameHi: l.jobRole?.nameHi,
    })),
    salaryType: user.salaryType,
    salaryAmount: user.salaryAmount,
    // Personal shift timing. Null anywhere here means the department's rule,
    // or the office policy, applies instead.
    shiftStart: user.shiftStart,
    graceMinutes: user.graceMinutes,
    halfDayAfter: user.halfDayAfter,
    weeklyReportDay: user.weeklyReportDay,
    dailyTarget: user.dailyTarget,
    autopilot: user.autopilot,
    permissions: user.role === ROLES.SUPER_ADMIN ? ['*'] : permissions,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

/** Trimmed shape for lists — salary omitted unless the caller may see it. */
export function listUser(user, { includePay = false } = {}) {
  const base = publicUser(user);
  if (!includePay) {
    delete base.salaryAmount;
    delete base.salaryType;
  }
  return base;
}
