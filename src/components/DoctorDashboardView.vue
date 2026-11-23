<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { showToast, Popup as VanPopup, Tabbar as VanTabbar, TabbarItem as VanTabbarItem } from 'vant';
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  FileSignature,
  HeartPulse,
  LogOut,
  MessageCircle,
  Phone,
  Search,
  ShieldCheck,
  Stethoscope,
  Users,
  UserCircle,
} from 'lucide-vue-next';
import { useAppStore, questionnaireStorageKey } from '../store/app';
import CampFlowCard from './CampFlowCard.vue';
import type { CardioPrescription, MetricStage } from '../types';

const store = useAppStore();
const tab = ref<'workbench' | 'patients' | 'followups' | 'profile'>('workbench');
const keyword = ref('');
const followupNote = ref('');
const activeFollowup = ref<string | null>(null);
const followupType = ref('线上随访');
const followupRisk = ref<'低' | '中' | '高'>('中');
const followupMedication = ref('');
const followupNextDate = ref('');
const followupReferral = ref('');
const showPatientDetail = ref(false);
const patientDetail = ref<any>(null);

const doctorCamps = computed(() => store.getDoctorCamps());
const activeCampId = computed(() => {
  const ids = doctorCamps.value.map((c) => c.id);
  if (store.selectedCampId && ids.includes(store.selectedCampId)) return store.selectedCampId;
  return doctorCamps.value.find((c) => c.status === 'active')?.id || doctorCamps.value[0]?.id || null;
});
const activeCampName = computed(() => doctorCamps.value.find((c) => c.id === activeCampId.value)?.name || '负责营期');

const patients = computed(() => store.getDoctorPatients(activeCampId.value));

const filteredPatients = computed(() => {
  const q = keyword.value.trim();
  if (!q) return patients.value;
  return patients.value.filter((p) => p.name.includes(q) || p.condition.includes(q));
});

const highRiskPatients = computed(() => patients.value.filter((p) => p.risk === '高'));
const flowPatient = computed(() => highRiskPatients.value[0] || patients.value[0] || null);
const pendingPrescriptions = computed(() => store.getPendingPrescriptions(activeCampId.value));
const latestPendingPrescription = computed(() => pendingPrescriptions.value[0] || null);
const patientDetailPendingRx = computed(() =>
  patientDetail.value
    ? pendingPrescriptions.value.find((p) => p.studentId === patientDetail.value.id) || null
    : null,
);
const patientDetailPrescription = computed(() =>
  patientDetail.value ? store.getStudentPrescription(patientDetail.value.id, patientDetail.value.campId) : null,
);
const patientNutrition = computed(() =>
  patientDetail.value ? store.getStudentNutritionPrescription(patientDetail.value.id, patientDetail.value.campId) : null,
);
const patientLatestFollowup = computed(() =>
  patientDetail.value ? store.getLatestDoctorFollowup(patientDetail.value.id, patientDetail.value.campId) : null,
);
const patientBp = computed(() =>
  patientDetail.value ? store.getLatestStudentBp(patientDetail.value.id, patientDetail.value.campId) : null,
);
const patientAnnotations = computed(() => {
  if (!patientDetail.value) return [];
  const campId = patientDetail.value.campId;
  const sid = patientDetail.value.id;
  const diet = store.getCampDietRecords(campId)
    .filter((r) => r.studentId === sid)
    .flatMap((r) => (r.comments || []).map((c) => ({ ...c, source: `${r.meal === 'breakfast' ? '早餐' : r.meal === 'lunch' ? '午餐' : r.meal === 'dinner' ? '晚餐' : '加餐'}饮食` })));
  const exercise = store.getCampExerciseRecords(campId)
    .filter((r) => r.studentId === sid)
    .flatMap((r) => (r.comments || []).map((c) => ({ ...c, source: '运动记录' })));
  return [...diet, ...exercise].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
});
const STAGE_METRICS = [
  { id: 'mc_cv_sbp', label: '收缩压', unit: 'mmHg' },
  { id: 'mc_cv_dbp', label: '舒张压', unit: 'mmHg' },
  { id: 'mc_bl_ldl', label: 'LDL-C', unit: 'mmol/L' },
  { id: 'mc_cv_hr', label: '静息心率', unit: '次/分' },
  { id: 'mc_cv_hcy', label: '同型半胱氨酸', unit: 'μmol/L' },
] as const;
const showStageMetrics = ref(false);
const stageForm = reactive<Record<MetricStage, Record<string, string>>>({
  baseline: {}, midterm: {}, closeout: {},
});
function openStageMetrics() {
  if (!patientDetail.value) return;
  const values = store.getMetricStageValues(patientDetail.value.id, patientDetail.value.campId);
  (['baseline', 'midterm', 'closeout'] as MetricStage[]).forEach((stage) => {
    STAGE_METRICS.forEach((m) => {
      const v = values[stage]?.[m.id];
      stageForm[stage][m.id] = v === null || v === undefined ? '' : String(v);
    });
  });
  showStageMetrics.value = true;
}
function saveStageMetrics() {
  if (!patientDetail.value) return;
  if (!store.hasPermission('action.manage_metrics')) {
    showToast('当前账号未开通阶段指标录入权限');
    return;
  }
  let ok = true;
  (['baseline', 'midterm', 'closeout'] as MetricStage[]).forEach((stage) => {
    const values: Record<string, number | string | null> = {};
    STAGE_METRICS.forEach((m) => {
      // <input type="number"> 的 v-model 会把值转成 number，这里兼容数字与字符串两种情况。
      const raw = stageForm[stage][m.id];
      const text = raw === null || raw === undefined ? '' : String(raw).trim();
      const num = text ? Number(text) : null;
      values[m.id] = num !== null && Number.isFinite(num) ? num : null;
    });
    if (!store.saveMetricStageSnapshot(patientDetail.value.id, patientDetail.value.campId, stage, values)) {
      ok = false;
    }
  });
  if (!ok) {
    showToast('阶段指标保存失败，请检查营期范围与权限');
    return;
  }
  const effective = store.getEffectiveMetricValues(patientDetail.value.id, patientDetail.value.campId);
  const sbp = Number(effective.mc_cv_sbp?.afterValue ?? effective.mc_cv_sbp?.beforeValue ?? 0);
  const dbp = Number(effective.mc_cv_dbp?.afterValue ?? effective.mc_cv_dbp?.beforeValue ?? 0);
  const ldl = Number(effective.mc_bl_ldl?.afterValue ?? effective.mc_bl_ldl?.beforeValue ?? 0);
  const hr = Number(effective.mc_cv_hr?.afterValue ?? effective.mc_cv_hr?.beforeValue ?? 0);
  patientDetail.value = {
    ...patientDetail.value,
    bp: sbp && dbp ? `${sbp}/${dbp}` : patientDetail.value.bp,
    ldl: ldl ? ldl.toFixed(1) : patientDetail.value.ldl,
    hr: hr || patientDetail.value.hr,
  };
  showStageMetrics.value = false;
  showToast({ message: '开营 / 第 6 个月 / 结营指标已保存', position: 'top' });
}
const patientQuestionnaire = computed(() => {
  if (!patientDetail.value) return null;
  try {
    const raw = localStorage.getItem(questionnaireStorageKey('submitted', patientDetail.value.id));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
});
const patientMedication = computed(() => {
  const q = patientQuestionnaire.value;
  if (!q?.hasMedication || q.hasMedication === '无') return '暂未记录长期用药';
  return q.medicationDetails || '已记录用药，具体名称待医护核对';
});
const patientReportCount = computed(() => patientQuestionnaire.value?.medicalReports?.length || 0);
const alertCount = computed(() => highRiskPatients.value.length + pendingPrescriptions.value.length);
const alertSummary = computed(() => {
  const items: string[] = [];
  highRiskPatients.value.slice(0, 2).forEach((p) => {
    items.push(`${p.name} 血压 ${p.bp} mmHg（${p.condition}）`);
  });
  if (latestPendingPrescription.value) {
    items.push(`${patientName(latestPendingPrescription.value.studentId)} 的运动处方等待签署`);
  }
  return items.join('；') || '当前负责营期暂无高风险预警。';
});

const followups = computed(() =>
  store.getDoctorFollowups(activeCampId.value).map((f) => ({
    ...f,
    name: patientName(f.studentId),
    text: f.note,
    date: f.date.slice(5, 16),
    risk: f.riskLevel,
  })),
);

const showPrescription = ref(false);
const activePrescription = ref<CardioPrescription | null>(null);
const confirmRxCheck = ref(false);
const doctorCampNames = computed(() => {
  const names = doctorCamps.value.map((c) => c.name).filter(Boolean);
  return names.length > 0 ? names.join('、') : '全部营期';
});

function signPrescription() {
  if (!activePrescription.value) return;
  if (!store.hasPermission('action.sign_prescription')) {
    showToast('当前账号未开通运动处方签署权限');
    return;
  }
  if (!confirmRxCheck.value) {
    showToast({ message: '请先确认已核对病历、运动评估与用药情况', position: 'top' });
    return;
  }
  const ok = store.signCardioPrescription(activePrescription.value.id);
  if (!ok) {
    showToast('处方状态已变化，请刷新后重试');
    return;
  }
  showPrescription.value = false;
  confirmRxCheck.value = false;
  showToast({ message: '运动处方已签署，同步至康复师与学员', position: 'top' });
}

function riskClass(risk: '高' | '中' | '低') {
  if (risk === '高') return 'bg-red-50 text-red-600';
  if (risk === '中') return 'bg-amber-50 text-amber-600';
  return 'bg-blue-50 text-blue-600';
}

function startFollowup(id: string) {
  const record = followups.value.find((f) => f.id === id);
  activeFollowup.value = id;
  followupNote.value = record?.note || '';
  followupType.value = record?.type || '线上随访';
  followupRisk.value = record?.riskLevel || '中';
  followupMedication.value = record?.medicationReview || '';
  followupNextDate.value = record?.nextFollowupDate || '';
  followupReferral.value = record?.referral || '';
}

function openPrescription(rx: CardioPrescription) {
  activePrescription.value = rx;
  confirmRxCheck.value = false;
  showPrescription.value = true;
}

function patientName(studentId: string) {
  return patients.value.find((p) => p.id === studentId)?.name
    || store.accounts.find((a) => a.id === studentId)?.name
    || '患者';
}

function openPatientChat(studentId: string, campId?: string) {
  store.openChatForStudent(studentId, campId || activeCampId.value);
}

function openPatientDetail(patient: any) {
  patientDetail.value = patient;
  showPatientDetail.value = true;
}

function chatFromPatientDetail() {
  if (!patientDetail.value) return;
  const patient = patientDetail.value;
  showPatientDetail.value = false;
  store.openChatForStudent(patient.id, patient.campId);
}

function prescriptionFromPatientDetail() {
  if (!patientDetailPendingRx.value) return;
  const rx = patientDetailPendingRx.value;
  showPatientDetail.value = false;
  openPrescription(rx);
}

function nutritionFromPatientDetail() {
  if (!patientDetail.value) return;
  store.setSelectedStudentId(patientDetail.value.id);
  store.detailSelectedCampId = patientDetail.value.campId;
  showPatientDetail.value = false;
  store.setCurrentView('nutrition-prescription');
}

function saveFollowup() {
  if (!store.hasPermission('action.create_followup')) {
    showToast('当前账号未开通医师随访记录权限');
    return;
  }
  if (!followupNote.value.trim()) {
    showToast('请填写随访结论');
    return;
  }
  const target = followups.value.find((f) => f.id === activeFollowup.value);
  if (!target?.studentId || !activeCampId.value) {
    showToast('未找到对应的患者或营期');
    return;
  }
  const saved = store.saveDoctorFollowup({
    campId: activeCampId.value,
    studentId: target.studentId,
    type: followupType.value.trim() || '线上随访',
    riskLevel: followupRisk.value,
    note: followupNote.value.trim(),
    medicationReview: followupMedication.value.trim(),
    nextFollowupDate: followupNextDate.value || undefined,
    referral: followupReferral.value.trim() || undefined,
  });
  if (!saved) {
    showToast('随访保存失败，请检查账号权限或营期范围');
    return;
  }
  showToast({ message: '随访记录已保存并留痕', position: 'top' });
  activeFollowup.value = null;
  followupNote.value = '';
  followupMedication.value = '';
  followupNextDate.value = '';
  followupReferral.value = '';
}
</script>

<template>
  <div class="flex min-h-[100dvh] flex-col bg-gradient-to-b from-[#EFF6FF] to-[#F8FBFF] pb-24 font-sans">
    <div class="px-6 pb-5 pt-[calc(env(safe-area-inset-top)+2rem)]">
      <div class="mb-4 flex items-center justify-between">
        <div class="flex items-center gap-2 text-xs font-semibold text-[#0B5FD7]">
          <Stethoscope class="h-4 w-4" />
          医师工作站
        </div>
        <button class="flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 text-xs text-gray-500 backdrop-blur" @click="store.logout()">
          <LogOut class="h-3 w-3" /> 退出
        </button>
      </div>
      <div class="flex items-center gap-4">
        <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#0B5FD7] shadow-md shadow-blue-200">
          <UserCircle class="h-7 w-7 text-white" />
        </div>
        <div>
          <h2 class="text-xl font-bold text-gray-900">{{ (store.user?.name || '周明远').slice(0, 1) }}医生，早上好</h2>
          <p class="mt-1 text-xs font-semibold text-[#0B5FD7]">{{ store.user?.organization || '北大国际医院' }} · 心血管内科</p>
          <p class="mt-1 text-[11px] text-gray-400">{{ activeCampName }} · 今天有 {{ highRiskPatients.length }} 位高风险患者需要重点跟进</p>
        </div>
      </div>
      <select
        :value="activeCampId || ''"
        class="mt-4 w-full rounded-xl border border-blue-100 bg-white/80 px-3 py-2 text-xs font-semibold text-[#0B5FD7] outline-none"
        @change="store.selectedCampId = ($event.target as HTMLSelectElement).value"
      >
        <option v-for="camp in doctorCamps" :key="camp.id" :value="camp.id">{{ camp.name }} · {{ camp.status === 'active' ? '进行中' : camp.status === 'ended' ? '已结束' : '未开始' }}</option>
      </select>
    </div>

    <div class="flex-1 space-y-4 px-5">
      <CampFlowCard
        v-if="flowPatient"
        :student-id="flowPatient.id"
        :camp-id="flowPatient.campId"
        :subject-name="flowPatient.name"
      />

      <div class="rounded-2xl border border-red-100 bg-red-50/80 p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-sm font-bold text-red-700">
            <AlertTriangle class="h-4 w-4" /> {{ alertCount }} 条风险 / 签署提醒
          </div>
          <span class="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-red-500">待处理</span>
        </div>
        <p class="mt-2 text-[11px] leading-relaxed text-red-700/80">{{ alertSummary }}</p>
        <button class="mt-3 flex items-center gap-1 text-[11px] font-semibold text-red-700" @click="tab = 'patients'">
          查看预警患者 <ChevronRight class="h-3 w-3" />
        </button>
      </div>

      <div class="grid grid-cols-4 gap-2">
        <div class="rounded-xl bg-white p-2.5 text-center shadow-sm">
          <p class="text-[10px] text-gray-400">今日患者</p>
          <p class="mt-1 text-xl font-bold text-gray-900">{{ patients.length }}</p>
        </div>
        <div class="rounded-xl bg-white p-2.5 text-center shadow-sm">
          <p class="text-[10px] text-gray-400">待签署</p>
          <p class="mt-1 text-xl font-bold text-amber-500">{{ pendingPrescriptions.length }}</p>
        </div>
        <div class="rounded-xl bg-white p-2.5 text-center shadow-sm">
          <p class="text-[10px] text-gray-400">高风险</p>
          <p class="mt-1 text-xl font-bold text-red-500">{{ highRiskPatients.length }}</p>
        </div>
        <div class="rounded-xl bg-white p-2.5 text-center shadow-sm">
          <p class="text-[10px] text-gray-400">待随访</p>
          <p class="mt-1 text-xl font-bold text-[#0B5FD7]">{{ followups.length }}</p>
        </div>
      </div>

      <template v-if="tab === 'workbench'">
        <div class="rounded-2xl bg-white p-4 shadow-sm">
          <div class="mb-3 flex items-center justify-between">
            <p class="text-sm font-bold text-gray-900">需要处理</p>
            <span class="text-[10px] text-gray-400">按风险排序</span>
          </div>
          <button v-if="highRiskPatients[0] && store.hasPermission('action.chat')" class="flex w-full items-center gap-3 rounded-xl bg-red-50/60 p-3 text-left" @click="openPatientChat(highRiskPatients[0].id, highRiskPatients[0].campId)">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-600">{{ highRiskPatients[0].name.slice(0, 1) }}</div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <p class="text-sm font-semibold text-gray-900">{{ highRiskPatients[0].name }} · {{ highRiskPatients[0].age }} 岁</p>
                <span class="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold text-red-600">高风险</span>
              </div>
              <p class="mt-1 text-[11px] text-gray-500">家庭血压 {{ highRiskPatients[0].bp }} · {{ highRiskPatients[0].condition }}</p>
            </div>
            <MessageCircle class="h-4 w-4 text-[#0B5FD7]" />
          </button>
          <button v-if="latestPendingPrescription && store.hasPermission('action.sign_prescription')" class="mt-2 flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left ring-1 ring-gray-100" @click="openPrescription(latestPendingPrescription)">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-600"><FileSignature class="h-5 w-5" /></div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-gray-900">{{ patientName(latestPendingPrescription.studentId) }} · 运动处方</p>
              <p class="mt-1 text-[11px] text-gray-500">康复师已提交「{{ latestPendingPrescription.mode }}」，等待医师签署</p>
            </div>
            <span class="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-semibold text-amber-600">待签署</span>
          </button>
          <div v-else-if="store.hasPermission('action.sign_prescription')" class="mt-2 flex w-full items-center gap-3 rounded-xl bg-emerald-50/60 p-3 text-left ring-1 ring-emerald-100">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-white text-emerald-600"><CheckCircle2 class="h-5 w-5" /></div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-gray-900">当前营期处方均已处理</p>
              <p class="mt-1 text-[11px] text-gray-500">签署结果已同步康复师与学员端</p>
            </div>
          </div>
          <button v-if="patients[2] && store.hasPermission('action.chat')" class="mt-2 flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left ring-1 ring-gray-100" @click="openPatientChat(patients[2].id, patients[2].campId)">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-[#0B5FD7]"><HeartPulse class="h-5 w-5" /></div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-gray-900">{{ patients[2].name }} · 团队随访</p>
              <p class="mt-1 text-[11px] text-gray-500">血压 {{ patients[2].bp }} · LDL-C {{ patients[2].ldl }} mmol/L</p>
            </div>
            <span class="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-semibold text-[#0B5FD7]">沟通</span>
          </button>
        </div>

        <div class="rounded-2xl bg-white p-4 shadow-sm">
          <div class="mb-3 flex items-center gap-2">
            <CalendarClock class="h-4 w-4 text-[#0B5FD7]" />
            <p class="text-sm font-bold text-gray-900">今日日程</p>
          </div>
          <div class="space-y-3 border-l-2 border-blue-100 pl-4">
            <div>
              <p class="text-xs font-semibold text-gray-900">10:30 团队随访 · 李明</p>
              <p class="mt-1 text-[11px] text-gray-400">第 2 周处方复核</p>
            </div>
            <div>
              <p class="text-xs font-semibold text-gray-900">14:00 门诊 · 张伟</p>
              <p class="mt-1 text-[11px] text-gray-400">血压预警到院复核</p>
            </div>
            <div>
              <p class="text-xs font-semibold text-gray-900">16:30 多学科讨论 · 王丽</p>
              <p class="mt-1 text-[11px] text-gray-400">运动风险与转诊方案</p>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="tab === 'patients'">
        <div class="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 shadow-sm">
          <Search class="h-4 w-4 text-gray-300" />
          <input v-model="keyword" class="w-full bg-transparent text-sm outline-none placeholder:text-gray-300" placeholder="搜索患者姓名或诊断" />
        </div>
        <div class="space-y-2">
          <div v-for="p in filteredPatients" :key="p.id" class="flex w-full cursor-pointer items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm active:scale-[0.99]" @click="openPatientChat(p.id, p.campId)">
            <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-[#0B5FD7]">{{ p.name.slice(0, 1) }}</div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <p class="text-sm font-semibold text-gray-900">{{ p.name }} · {{ p.age }} 岁</p>
                <span class="rounded-full px-1.5 py-0.5 text-[9px] font-semibold" :class="riskClass(p.risk)">{{ p.risk }}危</span>
              </div>
              <p class="mt-1 truncate text-[11px] text-gray-500">{{ p.condition }}</p>
              <p class="mt-1 text-[10px] text-gray-400">血压 {{ p.bp }} mmHg · LDL-C {{ p.ldl }} mmol/L · 静息心率 {{ p.hr }}</p>
            </div>
            <div class="shrink-0 space-y-1 text-right">
              <button class="rounded-full bg-blue-50 px-2 py-1 text-[9px] font-bold text-[#0B5FD7]" @click.stop="openPatientDetail(p)">档案</button>
              <div class="flex items-center justify-end gap-1 text-[9px] font-semibold text-[#0B5FD7]">
                <MessageCircle class="h-3.5 w-3.5" /> 随访
              </div>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="tab === 'followups'">
        <div v-for="f in followups" :key="f.id" class="rounded-2xl bg-white p-4 shadow-sm">
          <div class="flex items-center justify-between">
            <div>
              <p class="flex items-center gap-2 text-sm font-semibold text-gray-900">
                {{ f.name }} · {{ f.type }}
                <span class="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-600">{{ f.riskLevel }}危</span>
              </p>
              <p class="mt-1 text-[10px] text-gray-400">{{ f.date }} · 已留痕</p>
            </div>
            <CheckCircle2 class="h-4 w-4 text-[#0B5FD7]" />
          </div>
          <p class="mt-2 text-[11px] leading-relaxed text-gray-500">{{ f.text }}</p>
          <div class="mt-3 flex items-center gap-4">
            <button class="text-[11px] font-semibold text-[#0B5FD7]" @click="startFollowup(f.id)">继续记录本次随访</button>
            <button v-if="store.hasPermission('action.chat')" class="flex items-center gap-1 text-[11px] font-semibold text-[#0B5FD7]" @click="openPatientChat(f.studentId)">
              <MessageCircle class="h-3.5 w-3.5" /> 在线沟通
            </button>
          </div>
          <div v-if="activeFollowup === f.id" class="mt-3 rounded-xl bg-blue-50/60 p-3">
            <div class="mb-2 grid grid-cols-2 gap-2">
              <label class="space-y-1">
                <span class="text-[9px] font-bold text-gray-500">随访类型</span>
                <input v-model="followupType" class="w-full rounded-lg border border-blue-100 bg-white px-2 py-1.5 text-[10px] outline-none focus:border-[#0B5FD7]" placeholder="线上随访 / 第6个月复查" />
              </label>
              <label class="space-y-1">
                <span class="text-[9px] font-bold text-gray-500">风险分层</span>
                <select v-model="followupRisk" class="w-full rounded-lg border border-blue-100 bg-white px-2 py-1.5 text-[10px] outline-none">
                  <option value="低">低危</option>
                  <option value="中">中危</option>
                  <option value="高">高危</option>
                </select>
              </label>
            </div>
            <textarea v-model="followupNote" rows="3" class="w-full resize-none rounded-lg border border-blue-100 bg-white p-2 text-xs outline-none focus:border-[#0B5FD7]" placeholder="填写随访结论、用药调整与下次复诊时间" />
            <div class="mt-2 grid grid-cols-1 gap-2">
              <input v-model="followupMedication" class="rounded-lg border border-blue-100 bg-white p-2 text-[10px] outline-none focus:border-[#0B5FD7]" placeholder="用药复核建议（H5 仅记录，不模拟开药）" />
              <div class="grid grid-cols-2 gap-2">
                <input v-model="followupNextDate" type="date" class="rounded-lg border border-blue-100 bg-white p-2 text-[10px] outline-none focus:border-[#0B5FD7]" />
                <input v-model="followupReferral" class="rounded-lg border border-blue-100 bg-white p-2 text-[10px] outline-none focus:border-[#0B5FD7]" placeholder="转诊/到院复核建议" />
              </div>
            </div>
            <div class="mt-2 flex justify-end gap-2">
              <button class="rounded-lg bg-white px-3 py-1.5 text-[11px] text-gray-500" @click="activeFollowup = null">取消</button>
              <button class="rounded-lg bg-[#0B5FD7] px-3 py-1.5 text-[11px] font-semibold text-white" @click="saveFollowup">保存并留痕</button>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="rounded-2xl bg-white p-4 shadow-sm">
          <div class="flex items-center gap-3">
            <div class="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-[#0B5FD7]"><Stethoscope class="h-6 w-6" /></div>
            <div>
              <p class="text-sm font-bold text-gray-900">{{ store.user?.name || '周明远' }}</p>
              <p class="mt-1 text-[11px] text-gray-400">主任医师 · 心血管内科</p>
            </div>
          </div>
          <div class="mt-4 space-y-2 text-[11px] text-gray-500">
            <p class="flex items-center gap-2"><Phone class="h-3.5 w-3.5 text-[#0B5FD7]" /> 当前营期患者 {{ patients.length }} 人 · 高风险 {{ highRiskPatients.length }} 人</p>
            <p class="flex items-center gap-2"><ShieldCheck class="h-3.5 w-3.5 text-[#0B5FD7]" /> 负责营期：{{ doctorCampNames }} · 仅可查看所负责营期患者</p>
            <p class="flex items-center gap-2"><Activity class="h-3.5 w-3.5 text-[#0B5FD7]" /> 处方签署与随访记录全程留痕</p>
          </div>
        </div>
        <div class="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
          <p class="text-xs font-bold text-[#0B5FD7]">医师权限边界</p>
          <p class="mt-1.5 text-[11px] leading-relaxed text-gray-500">可查看健康档案、签署运动与营养处方、记录随访；不参与学员打卡激励，不修改平台规则。</p>
        </div>
      </template>
    </div>

    <VanPopup v-model:show="showPrescription" position="bottom" round>
      <div class="p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <div class="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200"></div>
        <div v-if="activePrescription" class="flex items-start justify-between">
          <div>
            <h3 class="text-lg font-bold text-gray-900">运动处方签署</h3>
            <p class="mt-1 text-xs text-gray-400">{{ patientName(activePrescription.studentId) }} · {{ activePrescription.mode }}</p>
          </div>
          <span class="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-600">待医师签署</span>
        </div>

        <div v-if="activePrescription" class="mt-4 space-y-3">
          <div class="rounded-xl bg-[#F7F9FC] p-3">
            <p class="text-[10px] text-gray-400">处方内容</p>
            <p class="mt-1 text-sm font-bold text-gray-900">{{ activePrescription.mode }}</p>
            <p class="mt-1 text-[11px] leading-relaxed text-gray-500">{{ activePrescription.intensity }} · {{ activePrescription.frequency }} · 每次 {{ activePrescription.duration }}</p>
          </div>
          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="rounded-xl bg-blue-50/60 py-2">
              <p class="text-[9px] text-gray-400">频次</p>
              <p class="mt-1 text-xs font-bold text-gray-900">{{ activePrescription.frequency }}</p>
            </div>
            <div class="rounded-xl bg-blue-50/60 py-2">
              <p class="text-[9px] text-gray-400">时长</p>
              <p class="mt-1 text-xs font-bold text-gray-900">{{ activePrescription.duration }}</p>
            </div>
            <div class="rounded-xl bg-blue-50/60 py-2">
              <p class="text-[9px] text-gray-400">RPE</p>
              <p class="mt-1 text-xs font-bold text-gray-900">{{ activePrescription.rpe }}</p>
            </div>
          </div>
          <div class="rounded-xl bg-[#F7F9FC] p-3">
            <p class="text-[10px] text-gray-400">运动心率与热身/放松</p>
            <p class="mt-1 text-[11px] leading-relaxed text-gray-500">
              心率：{{ activePrescription.targetHr }}<br />
              热身：{{ activePrescription.warmup }}<br />
              放松：{{ activePrescription.cooldown }}
            </p>
          </div>
          <div class="rounded-xl border border-amber-100 bg-amber-50/70 p-3">
            <p class="text-[10px] font-bold text-amber-700">运动风险提示</p>
            <p class="mt-1 text-[11px] leading-relaxed text-amber-700/80">{{ activePrescription.stopSigns }}</p>
          </div>
          <label class="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-[11px] leading-relaxed text-gray-600">
            <input v-model="confirmRxCheck" type="checkbox" class="mt-0.5 accent-[#0B5FD7]" />
            已核对患者病历、运动评估与用药情况
          </label>
        </div>

        <div class="mt-5 flex gap-3">
          <button class="flex-1 rounded-xl bg-gray-100 py-3 text-sm font-bold text-gray-500" @click="showPrescription = false">取消</button>
          <button
            v-if="store.hasPermission('action.sign_prescription')"
            class="flex-[2] rounded-xl py-3 text-sm font-bold text-white transition-all active:scale-[0.99]"
            :class="confirmRxCheck ? 'bg-[#0B5FD7]' : 'bg-gray-300'"
            @click="signPrescription"
          >签署通过</button>
        </div>
      </div>
    </VanPopup>

    <!-- 患者心血管档案：医师查看指标、确诊资料、用药与处方状态 -->
    <VanPopup v-model:show="showPatientDetail" position="bottom" round>
      <div v-if="patientDetail" class="max-h-[88vh] overflow-y-auto p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <div class="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200"></div>
        <div class="flex items-start gap-3">
          <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-base font-bold text-[#0B5FD7]">
            {{ patientDetail.name.slice(0, 1) }}
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-lg font-bold text-gray-900">{{ patientDetail.name }}</h3>
              <span class="rounded-full px-2 py-0.5 text-[10px] font-bold" :class="riskClass(patientDetail.risk)">{{ patientDetail.risk }}危</span>
            </div>
            <p class="mt-1 text-[11px] text-gray-500">{{ patientDetail.age }} 岁 · {{ patientDetail.condition }}</p>
            <p class="mt-0.5 text-[10px] text-gray-400">{{ patientDetail.phone }}</p>
          </div>
        </div>

        <div class="mt-4 grid grid-cols-3 gap-2 text-center">
          <div class="rounded-xl bg-blue-50/70 px-2 py-2.5">
            <p class="text-[9px] text-gray-400">家庭血压</p>
            <p class="mt-1 text-sm font-bold text-[#0B5FD7]">{{ patientDetail.bp }}</p>
            <p class="text-[8px] text-gray-400">mmHg</p>
          </div>
          <div class="rounded-xl bg-blue-50/70 px-2 py-2.5">
            <p class="text-[9px] text-gray-400">LDL-C</p>
            <p class="mt-1 text-sm font-bold text-[#0B5FD7]">{{ patientDetail.ldl }}</p>
            <p class="text-[8px] text-gray-400">mmol/L</p>
          </div>
          <div class="rounded-xl bg-blue-50/70 px-2 py-2.5">
            <p class="text-[9px] text-gray-400">静息心率</p>
            <p class="mt-1 text-sm font-bold text-[#0B5FD7]">{{ patientDetail.hr }}</p>
            <p class="text-[8px] text-gray-400">次/分</p>
          </div>
        </div>

        <div class="mt-2 flex items-center justify-between rounded-xl bg-white px-3 py-2 ring-1 ring-gray-100">
          <span class="text-[10px] text-gray-400">最近家庭血压自测</span>
          <span v-if="patientBp" class="text-[11px] font-bold" :class="patientBp.sbp >= 180 || patientBp.dbp >= 110 ? 'text-red-600' : 'text-[#0B5FD7]'">
            {{ patientBp.sbp }}/{{ patientBp.dbp }} mmHg · {{ patientBp.date.slice(5, 16) }}
          </span>
          <span v-else class="text-[10px] text-amber-600">暂无家庭记录，建议连续 7 天自测</span>
        </div>

        <div class="mt-4 rounded-xl border border-gray-100 bg-[#F7F9FC] p-3">
          <p class="text-[10px] font-bold text-gray-700">入营资料与风险核对</p>
          <div class="mt-2 space-y-2 text-[11px]">
            <div class="flex items-center justify-between">
              <span class="text-gray-500">三甲医院确诊病历 / 检查报告</span>
              <span v-if="store.hasPermission('action.view_reports')" :class="patientReportCount > 0 ? 'text-emerald-600' : 'text-amber-600'" class="font-bold">
                {{ patientReportCount > 0 ? `已上传 ${patientReportCount} 份` : '待补交' }}
              </span>
              <span v-else class="font-bold text-gray-400">无查看权限</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-gray-500">72 小时心电监测</span>
              <span class="font-bold text-gray-400">演示环境待接入设备</span>
            </div>
            <div class="flex items-start justify-between gap-3">
              <span class="shrink-0 text-gray-500">长期用药</span>
              <span class="text-right font-semibold text-gray-700">{{ store.hasPermission('action.view_medications') ? patientMedication : '无查看权限' }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-gray-500">运动处方</span>
              <span class="font-bold" :class="patientDetailPrescription?.status === 'signed' ? 'text-emerald-600' : 'text-amber-600'">
                {{ patientDetailPrescription?.status === 'signed' ? '医师已签署' : patientDetailPendingRx ? '待医师签署' : '待康复师评估' }}
              </span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-gray-500">营养处方</span>
              <span class="font-bold" :class="patientNutrition?.status === 'published' ? 'text-emerald-600' : 'text-amber-600'">
                {{ patientNutrition?.status === 'published' ? '营养师已发布' : '待营养师评估' }}
              </span>
            </div>
          </div>
        </div>

        <div v-if="patientLatestFollowup" class="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
          <div class="flex items-center justify-between">
            <p class="text-[10px] font-bold text-[#0B5FD7]">最近医师随访 · {{ patientLatestFollowup.type }}</p>
            <span class="text-[9px] text-gray-400">{{ patientLatestFollowup.date.slice(0, 16) }}</span>
          </div>
          <p class="mt-1 text-[10px] leading-relaxed text-gray-600">{{ patientLatestFollowup.note }}</p>
          <div class="mt-1 flex flex-wrap gap-2 text-[9px] text-gray-500">
            <span v-if="patientLatestFollowup.medicationReview">用药：{{ patientLatestFollowup.medicationReview }}</span>
            <span v-if="patientLatestFollowup.nextFollowupDate">下次：{{ patientLatestFollowup.nextFollowupDate }}</span>
            <span v-if="patientLatestFollowup.referral">转诊：{{ patientLatestFollowup.referral }}</span>
          </div>
        </div>

        <div class="mt-3 rounded-xl border border-gray-100 bg-white p-3">
          <p class="text-[10px] font-bold text-gray-700">教练 / 营养师批注摘要</p>
          <div v-if="patientAnnotations.length" class="mt-2 space-y-2">
            <p v-for="c in patientAnnotations" :key="c.id" class="text-[10px] leading-relaxed text-gray-500">
              <span class="font-bold text-gray-700">{{ c.name }}（{{ c.role === 'coach' ? '康复师' : '营养师' }}）· {{ c.source }}</span>
              {{ c.text }}
            </p>
          </div>
          <p v-else class="mt-1.5 text-[10px] text-gray-400">暂无团队批注。</p>
        </div>

        <div class="mt-3 rounded-xl border border-amber-100 bg-amber-50/70 p-3 text-[10px] leading-relaxed text-amber-700">
          <p class="font-bold">处方复核要点</p>
          <p class="mt-1">血压一般先以 &lt;130/80 mmHg 为管理方向；LDL-C 目标按冠心病、斑块、糖尿病等危险分层个体化。开方前需核对静息血压、近期胸痛/晕厥/住院史与用药，常规运动强度控制在 RPE 3 级以内；状态不稳定时先按 1–2 级恢复活动。</p>
          <p class="mt-1">服用他汀避免大量西柚汁；服用华法林时绿叶菜摄入保持稳定。不要建议患者自行停药或加用利尿剂。</p>
        </div>

        <button
          v-if="store.hasPermission('action.manage_metrics')"
          class="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#0B5FD7]/20 bg-blue-50/70 py-2.5 text-[11px] font-bold text-[#0B5FD7]"
          @click="openStageMetrics"
        >
          <ClipboardList class="h-3.5 w-3.5" /> 录入 / 查看开营·第6个月·结营指标
        </button>

        <div class="mt-4 flex gap-2">
          <button v-if="store.hasPermission('action.chat')" class="flex-1 rounded-xl border border-[#0B5FD7]/20 bg-white py-3 text-xs font-bold text-[#0B5FD7]" @click="chatFromPatientDetail">团队随访</button>
          <button class="flex-1 rounded-xl border border-emerald-200 bg-emerald-50 py-3 text-xs font-bold text-emerald-700" @click="nutritionFromPatientDetail">营养处方</button>
          <button
            v-if="patientDetailPendingRx && store.hasPermission('action.sign_prescription')"
            class="flex-[1.4] rounded-xl bg-[#0B5FD7] py-3 text-xs font-bold text-white"
            @click="prescriptionFromPatientDetail"
          >查看并签署处方</button>
          <button v-else-if="store.hasPermission('action.sign_prescription')" class="flex-[1.4] rounded-xl bg-gray-100 py-3 text-xs font-bold text-gray-400" disabled>暂无待签处方</button>
        </div>
      </div>
    </VanPopup>

    <VanPopup v-model:show="showStageMetrics" position="bottom" round>
      <div v-if="patientDetail" class="max-h-[88vh] overflow-y-auto p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <div class="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200"></div>
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-base font-bold text-gray-900">三阶段心血管指标</h3>
            <p class="mt-1 text-[10px] text-gray-400">{{ patientDetail.name }} · 开营 / 第 6 个月 / 结营</p>
          </div>
          <button class="rounded-full bg-gray-100 p-2 text-gray-500" @click="showStageMetrics = false">
            <ClipboardList class="h-4 w-4" />
          </button>
        </div>

        <div class="mt-4 rounded-xl bg-blue-50/60 p-3 text-[10px] leading-relaxed text-gray-500">
          血压、LDL-C、静息心率和同型半胱氨酸按三次入企检查记录。空值表示未检测；异常值需结合症状、用药和危险分层判断，不自动诊断。
        </div>

        <div class="mt-3 space-y-3">
          <div v-for="m in STAGE_METRICS" :key="m.id" class="rounded-xl bg-white p-3 ring-1 ring-gray-100">
            <div class="mb-2 flex items-center justify-between">
              <span class="text-[11px] font-bold text-gray-800">{{ m.label }}</span>
              <span class="text-[9px] text-gray-400">{{ m.unit }}</span>
            </div>
            <div class="grid grid-cols-3 gap-2">
              <label v-for="stage in (['baseline', 'midterm', 'closeout'] as MetricStage[])" :key="stage" class="rounded-lg bg-gray-50 p-2">
                <span class="text-[9px] font-bold" :class="stage === 'baseline' ? 'text-gray-500' : stage === 'midterm' ? 'text-amber-600' : 'text-[#0B5FD7]'">
                  {{ stage === 'baseline' ? '开营' : stage === 'midterm' ? '第6个月' : '结营' }}
                </span>
                <input v-model="stageForm[stage][m.id]" type="number" inputmode="decimal" class="mt-1 w-full bg-transparent text-sm font-bold text-gray-900 outline-none placeholder:text-gray-300" placeholder="--" />
              </label>
            </div>
          </div>
        </div>

        <div class="mt-4 flex gap-2">
          <button class="flex-1 rounded-xl bg-gray-100 py-3 text-sm font-bold text-gray-500" @click="showStageMetrics = false">取消</button>
          <button class="flex-[2] rounded-xl bg-[#0B5FD7] py-3 text-sm font-bold text-white active:scale-[0.99]" @click="saveStageMetrics">保存三阶段指标</button>
        </div>
      </div>
    </VanPopup>

    <VanTabbar v-model="tab" class="custom-tabbar">
      <VanTabbarItem v-if="store.hasPermission('menu.doctor_dashboard')" name="workbench">
        <template #icon><LayoutDashboard class="h-6 w-6" /></template>
        工作台
      </VanTabbarItem>
      <VanTabbarItem v-if="store.hasPermission('menu.doctor_patients')" name="patients">
        <template #icon><Users class="h-6 w-6" /></template>
        患者
      </VanTabbarItem>
      <VanTabbarItem v-if="store.hasPermission('menu.doctor_followups')" name="followups">
        <template #icon><ClipboardList class="h-6 w-6" /></template>
        随访
      </VanTabbarItem>
      <VanTabbarItem name="profile">
        <template #icon><UserCircle class="h-6 w-6" /></template>
        我的
      </VanTabbarItem>
    </VanTabbar>
  </div>
</template>
