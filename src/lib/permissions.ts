import type { Role } from '../types';

export interface Hospital {
  id: string;
  name: string;
  shortName: string;
  level: 'group' | 'hospital';
}

export const HOSPITALS: Hospital[] = [
  { id: '北大国际医院', name: '北大国际医院', shortName: '国际医院', level: 'group' },
  { id: '北大医疗康复医院', name: '北大医疗康复医院', shortName: '康复医院', level: 'hospital' },
  { id: '北大医疗淄博医院', name: '北大医疗淄博医院', shortName: '淄博医院', level: 'hospital' },
];

export interface PermissionItem {
  key: string;
  label: string;
  desc?: string;
}

export interface PermissionGroup {
  key: string;
  label: string;
  desc: string;
  items: PermissionItem[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: 'student',
    label: '学员端菜单',
    desc: '控制学员能看到和进入的功能入口',
    items: [
      { key: 'menu.dashboard', label: '健康首页', desc: '营期概览、风险提示与打卡任务' },
      { key: 'menu.health_profile', label: '健康档案', desc: '心血管指标、用药与检查资料' },
      { key: 'menu.exercise', label: '运动打卡', desc: '运动记录、处方与安全提示' },
      { key: 'menu.diet', label: '饮食打卡', desc: '饮食记录与营养师批注' },
      { key: 'menu.weight', label: '体重记录', desc: '体重趋势与水肿预警' },
      { key: 'menu.messages', label: '消息中心', desc: '医护随访、批注与系统通知' },
      { key: 'menu.activity_hub', label: '活动中心', desc: '趣味活动、排名与营期活动' },
      { key: 'menu.points_mall', label: '积分商城', desc: '小红花与礼品兑换' },
      { key: 'menu.my_rewards', label: '我的奖励', desc: '奖励领取与兑换记录' },
      { key: 'menu.badge_center', label: '我的徽章', desc: '勋章与成就' },
      { key: 'menu.personal_journey', label: '个人历程', desc: '个人健康变化与报告入口' },
      { key: 'menu.calendar', label: '健康日历', desc: '打卡日历与营期日程' },
    ],
  },
  {
    key: 'coach',
    label: '运动康复师菜单',
    desc: '控制康复师工作台与学员管理范围',
    items: [
      { key: 'menu.coach_dashboard', label: '康复师工作台', desc: '今日学员、处方与活动概览' },
      { key: 'menu.coach_students', label: '学员运动管理', desc: '查看学员运动记录与详情' },
      { key: 'menu.coach_annotations', label: '运动批注', desc: '待批注列表与运动点评' },
      { key: 'menu.coach_activities', label: '活动发布', desc: '发布营期运动活动' },
    ],
  },
  {
    key: 'doctor',
    label: '医师端菜单',
    desc: '控制医师工作台、患者与随访范围',
    items: [
      { key: 'menu.doctor_dashboard', label: '医师工作台', desc: '风险预警、今日患者与日程' },
      { key: 'menu.doctor_patients', label: '患者管理', desc: '患者档案与心血管指标' },
      { key: 'menu.doctor_followups', label: '随访记录', desc: '团队随访与随访留痕' },
      { key: 'menu.doctor_prescriptions', label: '处方签署', desc: '运动处方复核与签署' },
    ],
  },
  {
    key: 'dietitian',
    label: '营养师端菜单',
    desc: '控制营养师工作台与批注范围',
    items: [
      { key: 'menu.dietitian_dashboard', label: '营养师工作台', desc: '学员打卡与营养管理' },
      { key: 'menu.dietitian_students', label: '学员营养管理', desc: '查看饮食、体重与健康档案' },
      { key: 'menu.dietitian_annotations', label: '饮食批注', desc: '待批注列表与饮食点评' },
      { key: 'menu.dietitian_config', label: '营养配置', desc: '餐次、指标与营期配置' },
    ],
  },
  {
    key: 'hospital',
    label: '医院管理菜单',
    desc: '二级机构管理员与获授权的团队负责人使用',
    items: [
      { key: 'menu.account_manage', label: '账户管理', desc: '本院人员、角色与营期关联' },
      { key: 'menu.permission_config', label: '权限配置', desc: '按医院和角色配置菜单与操作权限' },
      { key: 'menu.camp_summary', label: '结营统计', desc: '本院营期数据与指标变化' },
      { key: 'menu.attendance_board', label: '打卡看板', desc: '本院学员打卡完成情况' },
      { key: 'menu.metric_config', label: '指标配置', desc: '慢病随访指标项目与参考范围' },
      { key: 'menu.enterprise_report', label: '机构报告', desc: '本院群体健康与风险报告' },
    ],
  },
  {
    key: 'platform',
    label: '集团平台菜单',
    desc: '仅一级集团管理员可配置，二级机构只读',
    items: [
      { key: 'menu.reward_config', label: '奖励规则', desc: '小红花、奖品阶梯与兑换规则' },
      { key: 'menu.activity_admin', label: '活动总开关', desc: '平台活动与商城开关' },
      { key: 'menu.badge_config', label: '徽章规则', desc: '平台徽章体系与发放规则' },
      { key: 'menu.fulfillment_center', label: '兑付中心', desc: '全集团发货、发放与兑换' },
      { key: 'menu.supervisor_dashboard', label: '运营总览', desc: '全集团运营数据与团队质控' },
    ],
  },
  {
    key: 'action',
    label: '关键操作权限',
    desc: '控制按钮级操作，未授权时入口隐藏或只读',
    items: [
      { key: 'action.chat', label: '进入团队随访', desc: '查看并打开医护随访会话' },
      { key: 'action.send_message', label: '发送随访消息', desc: '在团队会话中回复学员' },
      { key: 'action.annotate_diet', label: '饮食批注/评分', desc: '营养师批注与餐次评定' },
      { key: 'action.annotate_exercise', label: '运动批注/评分', desc: '康复师运动点评与评分' },
      { key: 'action.create_prescription', label: '新建运动处方', desc: '康复师提交心血管运动处方' },
      { key: 'action.sign_prescription', label: '签署运动处方', desc: '医师复核并签署处方' },
      { key: 'action.manual_score', label: '手动加减分', desc: '营养师补录线下积分' },
      { key: 'action.view_reports', label: '查看检查报告', desc: '查看确诊病历与检查资料' },
      { key: 'action.view_medications', label: '查看用药信息', desc: '查看长期用药与相互作用提示' },
      { key: 'action.export_report', label: '导出报告', desc: '导出个人/机构健康报告' },
      { key: 'action.manage_accounts', label: '新增/编辑账户', desc: '创建、禁用与调整团队成员' },
      { key: 'action.create_camp', label: '新建营期', desc: '为本院创建营期批次' },
      { key: 'action.config_rules', label: '平台规则配置', desc: '修改集团级奖励与活动规则' },
    ],
  },
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((group) => group.items.map((item) => item.key));

export const ROLE_DEFAULT_PERMISSIONS: Record<Role, string[]> = {
  student: [
    'menu.dashboard', 'menu.health_profile', 'menu.exercise', 'menu.diet', 'menu.weight',
    'menu.messages', 'menu.activity_hub', 'menu.points_mall', 'menu.my_rewards', 'menu.badge_center',
    'menu.personal_journey', 'menu.calendar',
    'action.chat', 'action.send_message', 'action.export_report',
  ],
  coach: [
    'menu.coach_dashboard', 'menu.coach_students', 'menu.coach_annotations', 'menu.coach_activities',
    'action.chat', 'action.send_message', 'action.annotate_exercise', 'action.create_prescription',
  ],
  doctor: [
    'menu.doctor_dashboard', 'menu.doctor_patients', 'menu.doctor_followups', 'menu.doctor_prescriptions',
    'action.chat', 'action.send_message', 'action.sign_prescription', 'action.view_reports', 'action.view_medications',
  ],
  dietitian: [
    'menu.dietitian_dashboard', 'menu.dietitian_students', 'menu.dietitian_annotations',
    'action.chat', 'action.send_message', 'action.annotate_diet', 'action.manual_score', 'action.export_report',
  ],
};

export const PLATFORM_ONLY_PERMISSIONS = new Set([
  'menu.reward_config', 'menu.activity_admin', 'menu.badge_config', 'menu.fulfillment_center',
  'menu.supervisor_dashboard', 'action.config_rules',
]);

export const ORG_ADMIN_PERMISSIONS = [
  'menu.account_manage', 'menu.permission_config', 'menu.camp_summary', 'menu.attendance_board',
  'menu.metric_config', 'menu.enterprise_report', 'menu.dietitian_config',
  'menu.coach_activities',
  'action.manage_accounts', 'action.create_camp', 'action.export_report',
  ...Object.values(ROLE_DEFAULT_PERMISSIONS).flat(),
].filter((key, index, list) => list.indexOf(key) === index && !PLATFORM_ONLY_PERMISSIONS.has(key));

export const VIEW_PERMISSION: Partial<Record<string, string>> = {
  dashboard: 'menu.dashboard',
  'health-profile': 'menu.health_profile',
  exercise: 'menu.exercise',
  diet: 'menu.diet',
  'weight-checkin': 'menu.weight',
  messages: 'menu.messages',
  'activity-hub': 'menu.activity_hub',
  'camp-activities': 'menu.activity_hub',
  'activities-list': 'menu.activity_hub',
  ranking: 'menu.activity_hub',
  'points-mall': 'menu.points_mall',
  'my-rewards': 'menu.my_rewards',
  reward: 'menu.my_rewards',
  'badge-center': 'menu.badge_center',
  'personal-journey': 'menu.personal_journey',
  'camp-report': 'menu.personal_journey',
  calendar: 'menu.calendar',
  'coach-dashboard': 'menu.coach_dashboard',
  'coach-student-detail': 'menu.coach_students',
  'coach-unannotated-list': 'menu.coach_annotations',
  'activity-upload': 'menu.coach_activities',
  'doctor-dashboard': 'menu.doctor_dashboard',
  'dietitian-dashboard': 'menu.dietitian_dashboard',
  'dietitian-student-detail': 'menu.dietitian_students',
  'dietitian-unannotated-list': 'menu.dietitian_annotations',
  'dietitian-config': 'menu.dietitian_config',
  'account-manage': 'menu.account_manage',
  'permission-config': 'menu.permission_config',
  'camp-summary': 'menu.camp_summary',
  'camp-stats': 'menu.camp_summary',
  'attendance-board': 'menu.attendance_board',
  'metric-config': 'menu.metric_config',
  'enterprise-report': 'menu.enterprise_report',
  'reward-config': 'menu.reward_config',
  'activity-admin': 'menu.activity_admin',
  'badge-config': 'menu.badge_config',
  'fulfillment-center': 'menu.fulfillment_center',
  'supervisor-dashboard': 'menu.supervisor_dashboard',
  'online-chat': 'action.chat',
};

export function uniquePermissions(keys: string[]): string[] {
  return keys.filter((key, index, list) => list.indexOf(key) === index);
}

export function permissionLabel(key: string): string {
  for (const group of PERMISSION_GROUPS) {
    const item = group.items.find((entry) => entry.key === key);
    if (item) return item.label;
  }
  return key;
}
