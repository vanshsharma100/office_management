import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const hash = (pw) => bcrypt.hash(pw, 10);
const iso = (d) => {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
};
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
};
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/** Section 3 + 9 — the six modules and their default question sets. */
const DEPARTMENTS = [
  {
    code: 'TECHNICAL',
    name: 'Technical',
    nameHi: 'तकनीकी',
    icon: 'Cpu',
    color: 'indigo',
    status: 'ACTIVE',
    target: 1200,
    jobRoles: [
      {
        name: 'Assembly',
        nameHi: 'असेंबली',
        questions: [
          { key: 'assemble_laptop', label: 'Assembling / dissembling — laptop', labelHi: 'असेंबलिंग / डिससेंबलिंग — लैपटॉप', unit: 'laptop' },
          { key: 'assemble_tiny', label: 'Assembling / dissembling — tiny', labelHi: 'असेंबलिंग / डिससेंबलिंग — टिनी', unit: 'tiny' },
        ],
      },
      {
        name: 'Cloning',
        nameHi: 'क्लोनिंग',
        questions: [
          { key: 'cloning_laptop', label: 'Cloning — laptop', labelHi: 'क्लोनिंग — लैपटॉप', unit: 'laptop' },
          { key: 'cloning_tiny', label: 'Cloning — tiny', labelHi: 'क्लोनिंग — टिनी', unit: 'tiny' },
        ],
      },
      {
        name: 'Ready',
        nameHi: 'रेडी',
        questions: [
          { key: 'laptop_ready', label: 'Laptop ready', labelHi: 'लैपटॉप तैयार', unit: 'laptop' },
          { key: 'tiny_ready', label: 'Tiny ready', labelHi: 'टिनी तैयार', unit: 'tiny' },
        ],
      },
      {
        name: 'Stock',
        nameHi: 'स्टॉक',
        questions: [
          { key: 'stock_counting', label: 'Stock counting', labelHi: 'स्टॉक गिनती' },
          { key: 'warranty_stock_check', label: 'Warranty stock check', labelHi: 'वारंटी स्टॉक जाँच' },
        ],
      },
      {
        name: 'Returns / QC',
        nameHi: 'रिटर्न / क्यूसी',
        questions: [
          { key: 'return_qc_laptop', label: 'Return quality check — laptop', labelHi: 'रिटर्न क्वालिटी चेक — लैपटॉप', type: 'CHECK_FAIL', unit: 'laptop' },
          { key: 'return_qc_tiny', label: 'Return quality check — tiny', labelHi: 'रिटर्न क्वालिटी चेक — टिनी', type: 'CHECK_FAIL', unit: 'tiny' },
        ],
      },
      {
        name: 'Dispatch',
        nameHi: 'डिस्पैच',
        questions: [
          { key: 'mfn_fba_laptop', label: 'MFN / FBA — laptop', labelHi: 'MFN / FBA — लैपटॉप', unit: 'laptop' },
          { key: 'mfn_fba_tiny', label: 'MFN / FBA — tiny', labelHi: 'MFN / FBA — टिनी', unit: 'tiny' },
          { key: 'lot_ready_laptop', label: 'LOT ready — laptop', labelHi: 'LOT तैयार — लैपटॉप', unit: 'laptop' },
          { key: 'lot_ready_tiny', label: 'LOT ready — tiny', labelHi: 'LOT तैयार — टिनी', unit: 'tiny' },
        ],
      },
    ],
  },
  { code: 'LISTING', name: 'Listing', nameHi: 'लिस्टिंग', icon: 'ListChecks', color: 'amber', status: 'COMING_SOON', jobRoles: [] },
  {
    code: 'PACKING_CLEANING',
    name: 'Packing & Cleaning',
    nameHi: 'पैकिंग और सफाई',
    icon: 'Package',
    color: 'emerald',
    status: 'ACTIVE',
    target: 900,
    jobRoles: [
      {
        name: 'Packing & Cleaning',
        nameHi: 'पैकिंग और सफाई',
        questions: [
          { key: 'cleaning_laptop', label: 'Cleaning — laptop', labelHi: 'सफाई — लैपटॉप', unit: 'laptop' },
          { key: 'cleaning_tiny', label: 'Cleaning — tiny', labelHi: 'सफाई — टिनी', unit: 'tiny' },
          { key: 'packing_laptop', label: 'Packing — laptop', labelHi: 'पैकिंग — लैपटॉप', unit: 'laptop' },
          { key: 'packing_tiny', label: 'Packing — tiny', labelHi: 'पैकिंग — टिनी', unit: 'tiny' },
        ],
      },
    ],
  },
  { code: 'ACCOUNTANT', name: 'Accountant', nameHi: 'लेखाकार', icon: 'Calculator', color: 'sky', status: 'COMING_SOON', jobRoles: [] },
  { code: 'MANAGERS', name: 'Managers', nameHi: 'प्रबंधक', icon: 'UserCog', color: 'rose', status: 'COMING_SOON', jobRoles: [] },
];

/**
 * The one starter employee. Everything else — attendance, work, tasks, notices,
 * salary extras — starts empty, so the first real numbers are the company's own.
 */
const STARTER_EMPLOYEE = {
  name: 'Rahul Sharma',
  username: 'rahul',
  dept: 'TECHNICAL',
  roles: ['Assembly'],
  salary: 22000,
};

/** Only created when SEED_DEMO_DATA=true. */
const DEMO_STAFF = [
  { name: 'Amit Verma', username: 'amit', dept: 'TECHNICAL', roles: ['Cloning'], salary: 21000 },
  { name: 'Priya Singh', username: 'priya', dept: 'TECHNICAL', roles: ['Ready', 'Stock'], salary: 24000 },
  { name: 'Sandeep Kumar', username: 'sandeep', dept: 'TECHNICAL', roles: ['Returns / QC'], salary: 23000 },
  { name: 'Neha Gupta', username: 'neha', dept: 'TECHNICAL', roles: ['Dispatch'], salary: 25000 },
  { name: 'Vikas Yadav', username: 'vikas', dept: 'PACKING_CLEANING', roles: ['Packing & Cleaning'], salary: 18000 },
  { name: 'Anjali Mehra', username: 'anjali', dept: 'PACKING_CLEANING', roles: ['Packing & Cleaning'], salary: 18500 },
  { name: 'Mohit Rana', username: 'mohit', dept: 'LISTING', roles: [], salary: 20000 },
];

async function main() {
  console.log('→ Seeding Ftech Office Management System');

  // ── Departments, job roles, questions ────────────────────────────────────
  const deptMap = {};
  for (const [i, d] of DEPARTMENTS.entries()) {
    const { jobRoles, ...data } = d;
    const dept = await prisma.department.upsert({
      where: { code: d.code },
      create: { ...data, sortOrder: i },
      update: { ...data, sortOrder: i },
    });
    deptMap[d.code] = dept;

    for (const [j, r] of jobRoles.entries()) {
      const role = await prisma.jobRole.upsert({
        where: { departmentId_name: { departmentId: dept.id, name: r.name } },
        create: { departmentId: dept.id, name: r.name, nameHi: r.nameHi, sortOrder: j },
        update: { nameHi: r.nameHi, sortOrder: j },
      });
      for (const [k, q] of r.questions.entries()) {
        await prisma.question.upsert({
          where: { jobRoleId_key: { jobRoleId: role.id, key: q.key } },
          create: { ...q, type: q.type ?? 'NUMBER', jobRoleId: role.id, sortOrder: k },
          update: { ...q, type: q.type ?? 'NUMBER', sortOrder: k },
        });
      }
    }
  }
  console.log(`  ✓ ${DEPARTMENTS.length} departments with job roles and questions`);

  // ── Super Admin + hidden backup account (Section 14.2) ───────────────────
  const superUsername = (process.env.SUPER_ADMIN_USERNAME || 'superadmin').toLowerCase();
  const superAdmin = await prisma.user.upsert({
    where: { username: superUsername },
    create: {
      employeeId: 'FT-0001',
      username: superUsername,
      passwordHash: await hash(process.env.SUPER_ADMIN_PASSWORD || 'Admin@123'),
      name: 'Ftech Owner',
      role: 'SUPER_ADMIN',
    },
    update: {},
  });

  const backupUsername = (process.env.BACKUP_ADMIN_USERNAME || 'ftech.backup').toLowerCase();
  await prisma.user.upsert({
    where: { username: backupUsername },
    create: {
      employeeId: 'FT-0000',
      username: backupUsername,
      passwordHash: await hash(process.env.BACKUP_ADMIN_PASSWORD || 'Backup@123'),
      name: 'Backup Super Admin',
      role: 'SUPER_ADMIN',
      isHidden: true, // never appears in any list, report or export
    },
    update: {},
  });
  console.log('  ✓ Super Admin + hidden backup account');

  // ── The one starter employee ────────────────────────────────────────────
  const starterDept = deptMap[STARTER_EMPLOYEE.dept];
  const starterRoles = await prisma.jobRole.findMany({
    where: { departmentId: starterDept.id, name: { in: STARTER_EMPLOYEE.roles } },
  });
  await prisma.user.upsert({
    where: { username: STARTER_EMPLOYEE.username },
    create: {
      employeeId: 'FT-0002',
      username: STARTER_EMPLOYEE.username,
      passwordHash: await hash('Pass@123'),
      name: STARTER_EMPLOYEE.name,
      role: 'EMPLOYEE',
      departmentId: starterDept.id,
      salaryType: 'MONTHLY',
      salaryAmount: STARTER_EMPLOYEE.salary,
      jobRoles: { create: starterRoles.map((r) => ({ jobRoleId: r.id })) },
    },
    update: {},
  });
  console.log(`  ✓ 1 employee (${STARTER_EMPLOYEE.name} — ${starterDept.name} / ${STARTER_EMPLOYEE.roles[0]})`);

  if (process.env.SEED_DEMO_DATA !== 'true') {
    console.log('  · No demo data — attendance, work, tasks, notices and salary all start empty');
    printCredentials(superUsername, backupUsername, false);
    return;
  }

  // ── Everything below is demo data (SEED_DEMO_DATA=true) ─────────────────
  const admin = await prisma.user.upsert({
    where: { username: 'manoj' },
    create: {
      employeeId: 'FT-0003',
      username: 'manoj',
      passwordHash: await hash('Admin@123'),
      name: 'Manoj Tiwari',
      role: 'ADMIN',
      departmentId: deptMap.TECHNICAL.id,
      salaryAmount: 32000,
      permissions: JSON.stringify([
        'employees.view',
        'attendance.view',
        'attendance.edit',
        'work.view',
        'work.approve',
        'work.backfill',
        'tasks.manage',
        'tasks.approve',
        'leave.approve',
        'notices.manage',
        'notices.readReceipts',
        'queries.answer',
        'departments.view',
      ]),
    },
    update: {},
  });

  // ── Demo employees ──────────────────────────────────────────────────────
  const starter = await prisma.user.findUnique({ where: { username: STARTER_EMPLOYEE.username } });
  const staff = [starter];
  for (const [i, s] of DEMO_STAFF.entries()) {
    const dept = deptMap[s.dept];
    const roles = await prisma.jobRole.findMany({
      where: { departmentId: dept.id, name: { in: s.roles } },
    });

    const user = await prisma.user.upsert({
      where: { username: s.username },
      create: {
        employeeId: `FT-${String(i + 4).padStart(4, '0')}`,
        username: s.username,
        passwordHash: await hash('Pass@123'),
        name: s.name,
        role: 'EMPLOYEE',
        departmentId: dept.id,
        salaryType: 'MONTHLY',
        salaryAmount: s.salary,
        phone: `98${rand(10000000, 99999999)}`,
        jobRoles: { create: roles.map((r) => ({ jobRoleId: r.id })) },
      },
      update: {},
    });
    staff.push(user);
  }
  console.log(`  ✓ 1 admin + ${staff.length} employees`);

  // ── 21 days of attendance and approved work ─────────────────────────────
  const existingWork = await prisma.workSubmission.count();
  if (existingWork === 0) {
    for (let back = 21; back >= 1; back -= 1) {
      const date = daysAgo(back);
      const weekday = new Date(`${date}T00:00:00`).getDay();
      if (weekday === 0) continue; // Sunday off

      for (const user of staff) {
        const roll = Math.random();
        const status = roll > 0.94 ? 'ABSENT' : roll > 0.9 ? 'WFH' : 'PRESENT';

        await prisma.attendance.upsert({
          where: { userId_date: { userId: user.id, date } },
          create: { userId: user.id, date, status, hours: status === 'ABSENT' ? 0 : rand(7, 9), source: 'SELF' },
          update: {},
        });
        if (status === 'ABSENT') continue; // absent = zero work (11.1)

        const groups = await prisma.userJobRole.findMany({
          where: { userId: user.id },
          include: { jobRole: { include: { questions: true } } },
        });
        const questions = groups.flatMap((g) => g.jobRole.questions);
        if (!questions.length) continue; // Coming Soon department

        const entries = questions.map((q) => {
          const value = rand(4, 30);
          return {
            questionId: q.id,
            value,
            failedValue: q.type === 'CHECK_FAIL' ? rand(0, Math.max(1, Math.floor(value * 0.12))) : 0,
          };
        });

        // Most days approved; some of the last two days left pending so the
        // approvals queue has something real in it.
        const pending = back <= 2 && Math.random() > 0.55;
        await prisma.workSubmission.create({
          data: {
            userId: user.id,
            date,
            status: pending ? 'PENDING' : 'APPROVED',
            submittedById: user.id,
            reviewedById: pending ? null : admin.id,
            reviewedAt: pending ? null : new Date(),
            entries: { create: entries },
          },
        });
      }
    }
    console.log('  ✓ 21 days of attendance + work submissions');
  }

  // Today's attendance so the daily board isn't empty.
  for (const user of staff) {
    await prisma.attendance.upsert({
      where: { userId_date: { userId: user.id, date: iso(new Date()) } },
      create: {
        userId: user.id,
        date: iso(new Date()),
        status: Math.random() > 0.9 ? 'LEAVE' : 'PRESENT',
        checkIn: new Date(),
        source: 'SELF',
      },
      update: {},
    });
  }

  // ── Notices, tasks, leave, a query, and pay items ───────────────────────
  if ((await prisma.notice.count()) === 0) {
    await prisma.notice.createMany({
      data: [
        {
          title: 'FBA shipment cut-off moved to Friday 4 PM',
          body: 'This week only. Dispatch team, please plan LOT ready counts accordingly. Anything not scanned by 4 PM rolls to Monday.',
          audience: 'ALL',
          pinned: true,
          createdById: superAdmin.id,
        },
        {
          title: 'Daily work must be submitted before leaving',
          body: 'Fill your numbers through the day and press submit before you go home. If your phone is out of battery, tell your admin — they can enter it for you.',
          audience: 'ALL',
          createdById: superAdmin.id,
        },
        {
          title: 'Deep cleaning drive — Saturday',
          body: 'Packing & Cleaning team to start an hour early on Saturday. Extra incentive applies.',
          audience: 'DEPARTMENT',
          departmentId: deptMap.PACKING_CLEANING.id,
          createdById: admin.id,
        },
      ],
    });

    await prisma.task.createMany({
      data: [
        {
          title: 'Clear the returns backlog',
          description: 'All pending return QC units from last week to be checked and logged.',
          departmentId: deptMap.TECHNICAL.id,
          priority: 'HIGH',
          dueDate: new Date(Date.now() + 2 * 86400000),
          createdById: superAdmin.id,
        },
        {
          title: 'Stock count — shelf A to D',
          description: 'Physical count against system quantity. Report mismatches.',
          assigneeId: staff[2].id,
          departmentId: deptMap.TECHNICAL.id,
          dueDate: new Date(Date.now() + 86400000),
          createdById: admin.id,
        },
        {
          title: 'Pack and label the MFN batch',
          departmentId: deptMap.PACKING_CLEANING.id,
          dueDate: new Date(Date.now() + 3 * 86400000),
          createdById: admin.id,
        },
      ],
    });

    await prisma.leaveRequest.createMany({
      data: [
        {
          userId: staff[1].id,
          type: 'SICK',
          fromDate: daysAgo(-2),
          toDate: daysAgo(-2),
          reason: 'Fever, will visit the doctor in the morning.',
        },
        {
          userId: staff[5].id,
          type: 'WFH',
          fromDate: daysAgo(-1),
          toDate: daysAgo(-1),
          reason: 'Society water pipeline work, cannot leave home.',
        },
      ],
    });

    await prisma.query.create({
      data: {
        userId: staff[0].id,
        subject: 'Cloning count not showing yesterday',
        message:
          'I submitted 18 cloning laptops yesterday but my dashboard shows 0. Can someone check if it was approved?',
      },
    });

    const month = iso(new Date()).slice(0, 7);
    await prisma.payItem.createMany({
      data: [
        { userId: staff[4].id, month, type: 'INCENTIVE', amount: 1500, note: 'Dispatch target met', createdById: superAdmin.id },
        { userId: staff[2].id, month, type: 'BONUS', amount: 1000, note: 'Extra shift', createdById: superAdmin.id },
        { userId: staff[3].id, month, type: 'DEDUCTION', amount: 500, note: 'Late marks', createdById: admin.id },
      ],
    });
    console.log('  ✓ notices, tasks, leave requests, a query and pay items');
  }

  printCredentials(superUsername, backupUsername, true);
}

function printCredentials(superUsername, backupUsername, demo) {
  console.log('\n  Sign-in details');
  console.log('  ───────────────────────────────────────────');
  console.log(`  Super Admin   ${superUsername} / ${process.env.SUPER_ADMIN_PASSWORD || 'Admin@123'}`);
  console.log('  Employee      rahul / Pass@123   (Technical → Assembly)');
  if (demo) {
    console.log('  Admin         manoj / Admin@123');
    console.log('  Employee      sandeep / Pass@123 (Technical → Returns / QC)');
    console.log('  Employee      vikas / Pass@123   (Packing & Cleaning)');
    console.log('  Employee      mohit / Pass@123   (Listing — Coming Soon)');
  }
  console.log('  ───────────────────────────────────────────');
  console.log(`  Hidden backup ${backupUsername} (not listed anywhere in the UI)\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
