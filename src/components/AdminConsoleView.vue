<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAppStore } from '../store/app';
import { Card, NavBar } from './ui';
import { Tabbar as VanTabbar, TabbarItem as VanTabbarItem, showToast } from 'vant';
import {
  Activity, Building2, ChevronRight, ClipboardCheck, FileHeart, FileText,
  Gift, HeartPulse, LayoutDashboard, LockKeyhole, Settings2, ShieldCheck,
  Stethoscope, UserCog, Users,
} from 'lucide-vue-next';
import { metricValuesFor } from '../mock/data';
import type { View } from '../store/app';

const store = useAppStore();
const isPlatform = computed(() => store.isPlatformAdminUser());
const selectedHospital = ref(isPlatform.value ? 'all' : store.getCurrentOrganization());

const hospitalOptions = computed(() => store.getAccessibleHospitals());
const scopedHospitals = computed(() =>
  isPlatform.value && selectedHospital.value === 'all'
    ? hospitalOptions.value
    : hospitalOptions.value.filter((h) => h.id === selectedHospital.value),
);

const scopedCamps = computed(() => {
  const allowed = new Set(scopedHospitals.value.map((h) => h.id));
  return store.camps.filter((c) => c.organization && allowed.has(c.organization));
});
const campIds = computed(() => new Set(scopedCamps.value.map((c) => c.id)));
const scopedAccounts = computed(() => {
  const allowed = new Set(scopedHospitals.value.map((h) => h.id));
  return store.accounts.filter((a) => a.active && a.organization && allowed.has(a.organization));
});
const students = computed(() =>
  scopedAccounts.value.filter((a) => a.role === 'student' && a.campIds?.some((id) => campIds.value.has(id))),
);
const teamMembers = computed(() => scopedAccounts.value.filter((a) => a.role !== 'student'));
const pendingPrescriptions = computed(() =>
  store.prescriptions.filter((p) => p.status === 'pending_doctor' && campIds.value.has(p.campId)),
);
const highRiskCount = computed(() => students.value.filter((s) => {
  const cid = s.campIds?.find((id) => campIds.value.has(id));
  if (!cid) return false;
  const v = metricValuesFor(s.id, cid) || {};
  const sbp = Number(v.mc_cv_sbp?.afterValue ?? v.mc_cv_sbp?.beforeValue ?? 0);
  const dbp = Number(v.mc_cv_dbp?.afterValue ?? v.mc_cv_dbp?.beforeValue ?? 0);
  const ldl = Number(v.mc_bl_ldl?.afterValue ?? v.mc_bl_ldl?.beforeValue ?? 0);
  return sbp >= 160 || dbp >= 100 || ldl >= 4.1;
}).length);
const followupCoverage = computed(() => {
  if (students.value.length === 0) return 0;
  const covered = students.value.filter((s) =>
    store.chatThreads.some((t) => t.studentId === s.id && campIds.value.has(t.campId) && t.messages.length > 1),
  ).length;
  return Math.round((covered / students.value.length) * 100);
});

const selectedHospitalLabel = computed(() => {
  if (selectedHospital.value === 'all') return '全集团';
  return hospitalOptions.value.find((h) => h.id === selectedHospital.value)?.name || selectedHospital.value;
});

function selectHospital(id: string) {
  if (!isPlatform.value) return;
  selectedHospital.value = id;
}

const menu = computed(() => {
  const items = [
    { label: '账户管理', desc: '本院人员、角色与营期关联', icon: UserCog, view: 'account-manage' as View, permission: 'menu.account_manage' },
    { label: '权限配置', desc: '菜单与按钮操作按角色授权', icon: ShieldCheck, view: 'permission-config' as View, permission: 'menu.permission_config' },
    { label: '结营统计', desc: '血压、血脂、运动与随访指标', icon: Activity, view: 'camp-summary' as View, permission: 'menu.camp_summary' },
    { label: '打卡看板', desc: '饮食、运动、体重完成情况', icon: ClipboardCheck, view: 'attendance-board' as View, permission: 'menu.attendance_board' },
    { label: '指标配置', desc: '慢病随访指标和参考范围', icon: Settings2, view: 'metric-config' as View, permission: 'menu.metric_config' },
    { label: '机构健康报告', desc: '风险分布、达标率与随访覆盖', icon: FileHeart, view: 'enterprise-report' as View, permission: 'menu.enterprise_report' },
  ];
  if (isPlatform.value) {
    items.push(
      { label: '奖励规则', desc: '小红花、奖品与兑换规则', icon: Gift, view: 'reward-config' as View, permission: 'menu.reward_config' },
      { label: '兑付中心', desc: '全集团礼品发放与核销', icon: ClipboardCheck, view: 'fulfillment-center' as View, permission: 'menu.fulfillment_center' },
    );
  }
  return items;
});

function openView(view: View) {
  const camp = scopedCamps.value.find((c) => c.status === 'active') || scopedCamps.value[0];
  if (camp) store.selectedCampId = camp.id;
  store.setCurrentView(view);
}

function openMenu(item: { view: View; permission: string; label: string }) {
  if (!store.hasPermission(item.permission)) {
    showToast(`当前账号未开通「${item.label}」，请联系集团管理员`);
    return;
  }
  openView(item.view);
}

function goPermissions() {
  if (!store.hasPermission('menu.permission_config')) {
    showToast('当前账号没有权限配置权限');
    return;
  }
  openView('permission-config');
}
</script>

<template>
  <div class="min-h-full bg-[#F4F7FB] pb-24">
    <div class="bg-gradient-to-br from-[#084C9E] via-[#0B5FD7] to-[#0A54C0] px-5 pb-8 pt-[calc(env(safe-area-inset-top)+1.5rem)] text-white">
      <div class="flex items-start justify-between">
        <div>
          <div class="mb-1 flex items-center gap-2 text-[11px] font-medium text-blue-100">
            <ShieldCheck class="h-4 w-4" />
            {{ isPlatform ? '集团一级管理端' : '医院二级管理端' }}
          </div>
          <h1 class="text-xl font-bold">心脑血管健康营 · 管理台</h1>
          <p class="mt-1 text-xs text-blue-100/90">{{ store.user?.name }} · {{ selectedHospitalLabel }}</p>
        </div>
        <div class="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px]">
          {{ isPlatform ? '全集团数据' : '仅本院数据' }}
        </div>
      </div>

      <div class="mt-5 grid grid-cols-3 gap-2">
        <div class="rounded-xl bg-white/12 px-2 py-3 text-center backdrop-blur-sm">
          <div class="text-xl font-bold">{{ students.length }}</div>
          <div class="mt-0.5 text-[9px] text-blue-100">在管学员</div>
        </div>
        <div class="rounded-xl bg-white/12 px-2 py-3 text-center backdrop-blur-sm">
          <div class="text-xl font-bold">{{ teamMembers.length }}</div>
          <div class="mt-0.5 text-[9px] text-blue-100">医护团队</div>
        </div>
        <div class="rounded-xl bg-white/12 px-2 py-3 text-center backdrop-blur-sm">
          <div class="text-xl font-bold">{{ scopedCamps.length }}</div>
          <div class="mt-0.5 text-[9px] text-blue-100">营期批次</div>
        </div>
      </div>
    </div>

    <div class="space-y-4 px-4 pt-4">
      <Card v-if="isPlatform" class="p-4">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="flex items-center gap-2 text-sm font-bold text-gray-900">
            <Building2 class="h-4 w-4 text-[#0B5FD7]" />医院范围
          </h2>
          <span class="text-[10px] text-gray-400">集团可查看全部医院</span>
        </div>
        <div class="flex gap-2 overflow-x-auto pb-1">
          <button
            class="shrink-0 rounded-xl border px-3 py-2 text-left"
            :class="selectedHospital === 'all' ? 'border-[#0B5FD7] bg-blue-50' : 'border-gray-100 bg-gray-50'"
            @click="selectHospital('all')"
          >
            <div class="text-xs font-bold text-gray-900">全集团</div>
            <div class="mt-0.5 text-[9px] text-gray-500">{{ hospitalOptions.length }} 家机构</div>
          </button>
          <button
            v-for="h in hospitalOptions"
            :key="h.id"
            class="shrink-0 rounded-xl border px-3 py-2 text-left"
            :class="selectedHospital === h.id ? 'border-[#0B5FD7] bg-blue-50' : 'border-gray-100 bg-gray-50'"
            @click="selectHospital(h.id)"
          >
            <div class="text-xs font-bold text-gray-900">{{ h.shortName }}</div>
            <div class="mt-0.5 text-[9px] text-gray-500">{{ store.camps.filter(c => c.organization === h.id).length }} 个营期</div>
          </button>
        </div>
      </Card>

      <Card v-else class="flex items-start gap-3 border-blue-100 bg-blue-50/60 p-4">
        <LockKeyhole class="mt-0.5 h-4 w-4 shrink-0 text-[#0B5FD7]" />
        <div>
          <p class="text-xs font-bold text-[#0B5FD7]">{{ store.getCurrentOrganization() }}</p>
          <p class="mt-1 text-[11px] leading-relaxed text-gray-500">二级账号仅能查看和配置本院数据，团队成员随医院归属，不能跨院查询。</p>
        </div>
      </Card>

      <div class="grid grid-cols-2 gap-3">
        <Card class="p-4">
          <HeartPulse class="mb-3 h-5 w-5 text-red-500" />
          <div class="text-2xl font-bold text-gray-900">{{ highRiskCount }}</div>
          <div class="mt-1 text-[10px] text-gray-500">高风险在管患者</div>
          <div class="mt-2 text-[9px] text-gray-400">血压 ≥160/100 或 LDL-C ≥4.1</div>
        </Card>
        <Card class="p-4">
          <Stethoscope class="mb-3 h-5 w-5 text-[#0B5FD7]" />
          <div class="text-2xl font-bold text-gray-900">{{ pendingPrescriptions.length }}</div>
          <div class="mt-1 text-[10px] text-gray-500">待医师签署处方</div>
          <div class="mt-2 text-[9px] text-gray-400">签署后同步康复师与学员</div>
        </Card>
        <Card class="p-4">
          <FileText class="mb-3 h-5 w-5 text-emerald-600" />
          <div class="text-2xl font-bold text-gray-900">{{ followupCoverage }}%</div>
          <div class="mt-1 text-[10px] text-gray-500">团队随访覆盖率</div>
          <div class="mt-2 text-[9px] text-gray-400">已有双向沟通的学员占比</div>
        </Card>
        <Card class="p-4">
          <Users class="mb-3 h-5 w-5 text-orange-500" />
          <div class="text-2xl font-bold text-gray-900">{{ scopedCamps.length }}</div>
          <div class="mt-1 text-[10px] text-gray-500">营期批次</div>
          <button class="mt-2 text-[9px] font-bold text-[#0B5FD7]" @click="openView('account-manage')">管理批次 →</button>
        </Card>
      </div>

      <Card class="p-4">
        <div class="mb-3 flex items-center justify-between border-b border-gray-100 pb-3">
          <h2 class="text-sm font-bold text-gray-900">管理功能</h2>
          <button class="text-[10px] font-bold text-[#0B5FD7]" @click="goPermissions">权限配置</button>
        </div>
        <div class="divide-y divide-gray-50">
          <button
            v-for="item in menu"
            :key="item.view"
            class="flex w-full items-center gap-3 py-3 text-left active:opacity-70"
            @click="openMenu(item)"
          >
            <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0B5FD7]/8 text-[#0B5FD7]">
              <component :is="item.icon" class="h-4 w-4" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-xs font-bold text-gray-900">{{ item.label }}</div>
              <div class="mt-0.5 truncate text-[10px] text-gray-400">{{ item.desc }}</div>
            </div>
            <ChevronRight class="h-4 w-4 shrink-0 text-gray-300" />
          </button>
        </div>
      </Card>

      <div class="rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-3">
        <p class="flex items-center gap-1.5 text-[10px] font-bold text-[#0B5FD7]">
          <ShieldCheck class="h-3.5 w-3.5" />两级管理边界
        </p>
        <p class="mt-1.5 text-[10px] leading-relaxed text-gray-500">
          一级集团管理员可看全集团、配置集团规则；二级医院管理员仅可管理本院账户、营期和团队权限。所有团队成员权限跟随医院，不能跨院查看。
        </p>
      </div>
    </div>

    <VanTabbar class="custom-tabbar" :model-value="0">
      <VanTabbarItem>
        <template #icon><LayoutDashboard class="h-6 w-6" /></template>
        管理首页
      </VanTabbarItem>
      <VanTabbarItem @click="openView('account-manage')">
        <template #icon><Users class="h-6 w-6" /></template>
        账户
      </VanTabbarItem>
      <VanTabbarItem @click="goPermissions">
        <template #icon><ShieldCheck class="h-6 w-6" /></template>
        权限
      </VanTabbarItem>
    </VanTabbar>
  </div>
</template>
