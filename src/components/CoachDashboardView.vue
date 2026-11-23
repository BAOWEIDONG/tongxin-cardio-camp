<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useAppStore } from '../store/app';
import { useDebounced } from '../composables/useDebounced';
import { useCoachCounts } from '../lib/coachCounts';
import { usePaged } from '../composables/usePaged';
import { campDateRange } from '../lib/camps';
import { rankStudents } from '../lib/scoring';
import { DEFAULT_CARDIO_RPE, RPE_PRESCRIPTION_OPTIONS } from '../lib/rpe';
import { Card } from './ui';
import ActivityCard from './ActivityCard.vue';
import CampFlowCard from './CampFlowCard.vue';
import type { CoachActivityRecord } from '../types';
import { UserCircle, LogOut, Clock, FileText, Users, CheckCircle, XCircle, Search, X, ChevronDown, Dumbbell, ClipboardList, HeartPulse, MessageCircle } from 'lucide-vue-next';
import { Tabbar as VanTabbar, TabbarItem as VanTabbarItem, Popup as VanPopup, showConfirmDialog, showToast } from 'vant';

const store = useAppStore();
const { unannotatedCount: coachUnannotatedCount } = useCoachCounts();

const activeTab = computed<'incomplete' | 'completed' | 'activities'>({
  get: () => store.coachDashboardTab,
  set: (v) => { store.coachDashboardTab = v; },
});
const searchQuery = ref('');
const showPrescription = ref(false);
const prescriptionForm = ref({
  studentId: '',
  mode: '室内快走 + 弹力带轻阻力训练',
  intensity: '低至中等强度',
  freq: '5 次/周',
  duration: '20–30 分钟',
  targetHr: '88–105 次/分（以能完整说句子为准）',
  rpe: DEFAULT_CARDIO_RPE,
  warmup: '慢走 + 踝泵 + 肩部活动 5 分钟',
  cooldown: '慢走 + 小腿拉伸 5 分钟，避免突然停下',
  stopSigns: '胸痛、胸闷、晕厥、明显心悸、异常气短或血压 ≥180/110 时立即停止',
  note: '服药后 1 小时内避免突然加大强度；高温天气改为室内。',
});

function submitPrescription() {
  if (!prescriptionForm.value.studentId || !activeCampId.value) {
    showToast('请选择需要开处方的学员');
    return;
  }
  store.submitCardioPrescription({
    campId: activeCampId.value,
    studentId: prescriptionForm.value.studentId,
    mode: prescriptionForm.value.mode,
    intensity: prescriptionForm.value.intensity,
    frequency: prescriptionForm.value.freq,
    duration: prescriptionForm.value.duration,
    targetHr: prescriptionForm.value.targetHr,
    rpe: prescriptionForm.value.rpe,
    warmup: prescriptionForm.value.warmup,
    cooldown: prescriptionForm.value.cooldown,
    stopSigns: prescriptionForm.value.stopSigns,
    note: prescriptionForm.value.note,
  });
  showPrescription.value = false;
  showToast({ message: '运动处方已提交医师审核', position: 'top' });
}

const myPendingPrescriptions = computed(() => {
  const coachId = store.user?.id;
  return store.prescriptions.filter((p) =>
    p.coachId === coachId && p.status === 'pending_doctor' && (!activeCampId.value || p.campId === activeCampId.value),
  );
});

const openPrescriptionForm = () => {
  if (!store.hasPermission('action.create_prescription')) {
    showToast('当前账号未开通新建运动处方权限');
    return;
  }
  prescriptionForm.value.studentId = campStudents.value[0]?.id || '';
  showPrescription.value = true;
};

// ─── 营期切换 ───
const showCampPicker = ref(false);
const coachCamps = computed(() => store.getCoachCamps());
// 未选具体营期时回落到第一个 active 营期，避免"全部营期"跨期汇总导致多营期学员重复计分（与营养师端/学员端口径一致）
const activeCampId = computed(() => {
  if (store.selectedCampId && coachCamps.value.some((c) => c.id === store.selectedCampId)) return store.selectedCampId;
  const active = coachCamps.value.find((c) => c.status === 'active');
  const first = coachCamps.value.length > 0 ? coachCamps.value[0] : null;
  return active?.id || first?.id || null;
});
const activeCampName = computed(() => {
  if (!activeCampId.value) return '全部营期';
  return coachCamps.value.find(c => c.id === activeCampId.value)?.name || '全部营期';
});

// 按营期过滤学员
const campStudents = computed(() => {
  const allCoachStudents = store.getCoachStudents();
  if (!activeCampId.value) return allCoachStudents;
  // 按营期精确过滤
  return allCoachStudents.filter(s => {
    const account = store.accounts.find(a => a.id === s.id);
    return account?.campIds?.includes(activeCampId.value!);
  });
});
const flowStudent = computed(() => campStudents.value[0] || null);

// 按营期过滤运动记录
const campExerciseRecords = computed(() =>
  activeCampId.value ? store.getCampExerciseRecords(activeCampId.value) : store.exerciseRecords
);

const campDietRecords = computed(() => activeCampId.value ? store.getCampDietRecords(activeCampId.value) : store.dietRecords);
const campManualRecords = computed(() => activeCampId.value ? store.getCampManualScoreRecords(activeCampId.value) : store.manualScoreRecords);
// 防抖镜像：打卡/批注高频变化时，首页重计算合并为 300ms 一次，避免提交即全量重排卡顿
const dDietRecords = useDebounced(campDietRecords);
const dExerciseRecords = useDebounced(campExerciseRecords);
const dManualRecords = useDebounced(campManualRecords);
const rankedStudents = computed(() =>
  campStudents.value.length === 0 ? [] : rankStudents(campStudents.value, dDietRecords.value, dExerciseRecords.value, dManualRecords.value)
);

const _now = new Date();
const todayStr = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`;

const studentsStatus = computed(() =>
  campStudents.value.map(student => {
    const studentExercises = dExerciseRecords.value.filter(
      r => r.studentId === student.id && r.date.startsWith(todayStr)
    );
    const hasExercise = studentExercises.length > 0;

    // 未批注的运动记录数
    const unannotatedExercises = dExerciseRecords.value.filter(
      r => r.studentId === student.id && !r.coachComment && r.coachScore == null
    ).length;

    const rankInfo = rankedStudents.value.find(r => r.studentId === student.id);

    return {
      ...student,
      hasExercise,
      unannotatedCount: unannotatedExercises,
      totalScore: rankInfo?.totalScore || 0,
    };
  })
    .sort((a, b) => b.totalScore - a.totalScore)
);

const completedStudents = computed(() => studentsStatus.value.filter(s => s.hasExercise));
const incompleteStudents = computed(() => studentsStatus.value.filter(s => !s.hasExercise));

const searchKeyword = computed(() => searchQuery.value.trim().toLowerCase());
// 姓名或手机号匹配
const matchStudent = (s: { name: string; phone: string }) =>
  s.name.toLowerCase().includes(searchKeyword.value) || s.phone.includes(searchQuery.value.trim());
const filteredComplete = computed(() => {
  if (!searchKeyword.value) return completedStudents.value;
  return completedStudents.value.filter(matchStudent);
});
const filteredIncomplete = computed(() => {
  if (!searchKeyword.value) return incompleteStudents.value;
  return incompleteStudents.value.filter(matchStudent);
});
// 首页学员列表分页：默认前 20，更多点「加载更多」（切 tab 重置）
const displayedStudents = computed(() => (activeTab.value === 'incomplete' ? filteredIncomplete.value : filteredComplete.value));
const { items: pagedStudents, hasMore, remaining, loadMore, reset: resetPagedStudents } = usePaged(displayedStudents, 20);
watch(activeTab, () => resetPagedStudents());

const sortedActivities = computed(() =>
  [...store.coachActivities].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
);

const openStudent = (id: string) => {
  store.setSelectedStudentId(id);
  store.setCurrentView('coach-student-detail');
};

const openStudentChat = (id: string) => {
  store.openChatForStudent(id, activeCampId.value);
};

// ─── 教练活动编辑/删除 ───
const editActivity = (activity: CoachActivityRecord) => {
  store.setEditingActivity(activity);
  store.setCurrentView('activity-upload');
};
const deleteActivity = async (activity: CoachActivityRecord) => {
  try {
    await showConfirmDialog({
      title: '删除活动',
      message: `确认删除活动「${activity.title}」吗？删除后学员端将不再展示。`,
      confirmButtonColor: '#ee0a24',
    });
    store.deleteCoachActivity(activity.id);
    showToast({ message: '已删除', position: 'top', duration: 2000 });
  } catch { /* 用户取消 */ }
};

const maskPhone = (phone: string) => phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');

// 营期选择
const selectCamp = (campId: string | null) => {
  store.selectedCampId = campId;
  showCampPicker.value = false;
};
</script>

<template>
  <div class="flex min-h-[100dvh] flex-col pb-24 font-sans bg-gradient-to-b from-[#EFF6FF] to-[#F8FBFF]">
    <!-- Header -->
    <div class="pt-[calc(env(safe-area-inset-top)+2.5rem)] px-6 pb-6">
      <div class="flex justify-end mb-2">
        <button @click="store.logout()" class="text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-1 text-xs bg-white/50 px-2 py-1 rounded-full backdrop-blur-sm">
          <LogOut class="h-3 w-3" /> 退出
        </button>
      </div>
      <div class="flex items-center space-x-4">
        <div class="h-14 w-14 rounded-full bg-[#0B5FD7] flex items-center justify-center shadow-md shrink-0">
          <UserCircle class="h-7 w-7 text-white" />
        </div>
        <div>
          <h2 class="text-xl font-bold text-gray-900">康复师您好，{{ (store.user?.name || '康复师').replace('教练', '康复师') }}</h2>
          <p class="text-xs font-bold text-[#0B5FD7] uppercase tracking-wider mt-1">您当前负责 {{ campStudents.length }} 名学员</p>
        </div>
      </div>
    </div>

    <div class="flex-1 px-5 space-y-4 relative -mt-2">
      <!-- 营期切换 -->
      <div class="flex items-center gap-2 mb-1">
        <button
          @click="showCampPicker = true"
          class="flex items-center gap-1.5 px-3 py-2 bg-white/55 backdrop-blur-md rounded-xl border border-white/60 text-sm font-medium text-gray-700 active:bg-gray-50 shadow-sm"
        >
          {{ activeCampName }}
          <ChevronDown class="w-4 h-4 text-gray-400" />
        </button>
        <span class="text-xs text-gray-400">{{ campStudents.length }} 名学员</span>
      </div>

      <CampFlowCard
        v-if="flowStudent"
        :student-id="flowStudent.id"
        :camp-id="activeCampId"
        :subject-name="flowStudent.name"
      />

      <!-- 运动处方入口 -->
      <Card class="p-4 border border-white/70 bg-white/70 backdrop-blur-md shadow-sm">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-xl bg-[#0B5FD7]/10 flex items-center justify-center text-[#0B5FD7] shrink-0">
            <ClipboardList class="h-5 w-5" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-bold text-gray-900">运动处方</div>
            <div class="text-[10px] text-gray-500 mt-0.5">
              当前营期待医师签署 {{ myPendingPrescriptions.length }} 份 · 签署后自动同步学员
            </div>
          </div>
          <button v-if="store.hasPermission('action.create_prescription')" class="text-[11px] font-bold text-white bg-[#0B5FD7] px-3 py-1.5 rounded-full shrink-0 active:scale-95" @click="openPrescriptionForm">
            新建处方
          </button>
        </div>
      </Card>

      <!-- Tab 切换 -->
      <div class="flex bg-white/55 backdrop-blur-md p-1 rounded-xl shadow-sm mb-4 border border-white/60">
        <button
          :class="['flex-1 py-2 text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5', activeTab === 'incomplete' ? 'bg-[#FF976A] text-white shadow-sm' : 'text-gray-500 hover:text-gray-900']"
          @click="activeTab = 'incomplete'"
        >
          <XCircle class="w-4 h-4" />
          未运动 ({{ filteredIncomplete.length }})
        </button>
        <button
          :class="['flex-1 py-2 text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5', activeTab === 'completed' ? 'bg-[#0B5FD7] text-white shadow-sm' : 'text-gray-500 hover:text-gray-900']"
          @click="activeTab = 'completed'"
        >
          <CheckCircle class="w-4 h-4" />
          已运动 ({{ filteredComplete.length }})
        </button>
        <button
          :class="['flex-1 py-2 text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5', activeTab === 'activities' ? 'bg-[#1677FF] text-white shadow-sm' : 'text-gray-500 hover:text-gray-900']"
          @click="activeTab = 'activities'"
        >
          <FileText class="w-4 h-4" />
          活动
        </button>
      </div>

      <!-- 学员列表 -->
      <template v-if="activeTab === 'incomplete' || activeTab === 'completed'">
        <!-- 搜索框（未运动/已运动 tab 下方，支持姓名或手机号） -->
        <div class="relative mb-4">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索学员姓名或手机号"
            class="w-full pl-9 pr-9 py-2.5 bg-white/55 backdrop-blur-md border border-white/60 rounded-xl text-sm shadow-sm focus:outline-none focus:border-[#0B5FD7] transition-colors"
          />
          <button v-if="searchQuery" @click="searchQuery = ''" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="space-y-3">
          <template v-if="displayedStudents.length > 0">
            <div
              v-for="student in pagedStudents"
              :key="student.id"
              class="flex items-center justify-between p-4 rounded-2xl bg-white/55 backdrop-blur-md border border-white/60 cursor-pointer hover:border-[#0B5FD7] transition-colors shadow-sm mb-3"
              @click="openStudent(student.id)"
            >
              <div class="flex items-start space-x-3">
                <div class="h-10 w-10 rounded-full bg-[#0B5FD7]/10 flex items-center justify-center text-[#0B5FD7] shrink-0">
                  <UserCircle class="h-6 w-6" />
                </div>
                <div>
                  <div class="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2">
                    {{ student.name || '未填写' }}
                    <span v-if="student.unannotatedCount > 0" class="text-[10px] font-medium bg-[#FF976A]/10 text-[#FF976A] px-1.5 py-0.5 rounded">
                      {{ student.unannotatedCount }}条待批注
                    </span>
                  </div>
                  <div class="text-[10px] text-gray-500 mb-1.5">
                    {{ student.gender === 'male' ? '男' : '女' }} · {{ student.age }}岁 · {{ maskPhone(student.phone) }}
                  </div>
                  <div class="flex flex-wrap gap-1">
                    <span v-if="student.hasExercise" class="px-1.5 py-0.5 rounded text-[9px] font-medium bg-green-50 text-green-600">
                      今日已运动
                    </span>
                    <span v-else class="px-1.5 py-0.5 rounded text-[9px] font-medium bg-red-50 text-red-500">
                      未打卡运动
                    </span>
                  </div>
                </div>
              </div>
              <button v-if="store.hasPermission('action.chat')" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#0B5FD7]" @click.stop="openStudentChat(student.id)">
                <MessageCircle class="h-4 w-4" />
              </button>
            </div>
            <button v-if="hasMore" @click="loadMore" class="w-full py-2.5 mb-1 text-xs font-bold text-[#0B5FD7] bg-white/55 backdrop-blur-md border border-[#0B5FD7]/30 rounded-xl active:bg-blue-50">
              加载更多（还有 {{ remaining }} 名学员）
            </button>
          </template>
          <div v-else class="text-center text-xs text-gray-400 py-4 rounded-2xl bg-white/55 backdrop-blur-md border border-white/60">
            {{ activeTab === 'incomplete' ? '所有学员已完成今日运动' : '暂无学员完成今日运动' }}
          </div>
        </div>
      </template>

      <!-- 活动管理 -->
      <template v-if="activeTab === 'activities'">
        <Card class="flex items-center justify-between p-4 cursor-pointer hover:border-[#0B5FD7] transition-colors bg-[#0B5FD7]/[0.06] mb-4" @click="store.setEditingActivity(null); store.setCurrentView('activity-upload')">
          <div class="flex items-center space-x-3">
            <div class="h-10 w-10 rounded-full bg-[#0B5FD7]/10 flex items-center justify-center text-[#0B5FD7]">
              <FileText class="h-5 w-5" />
            </div>
            <div>
              <div class="text-sm font-bold text-gray-900">上传锻炼活动</div>
              <div class="text-[10px] text-gray-500">支持图文形式，添加活动介绍</div>
            </div>
          </div>
          <div class="text-[#0B5FD7] font-bold">›</div>
        </Card>

        <div class="flex items-center justify-between mt-4 mb-4">
          <h3 class="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Clock class="w-4 h-4 text-gray-400" />
            历史发布活动
          </h3>
        </div>

        <div v-if="sortedActivities.length === 0" class="text-center py-10 text-gray-400 text-sm">
          暂无发布的锻炼活动
        </div>
        <div v-else class="space-y-4">
          <ActivityCard
            v-for="activity in sortedActivities"
            :key="activity.id"
            :activity="activity"
            editable
            @edit="editActivity"
            @delete="deleteActivity"
          />
        </div>
      </template>
    </div>

    <!-- Bottom Nav -->
    <VanTabbar class="custom-tabbar tabbar-green" :model-value="0">
      <VanTabbarItem>
        <template #icon><Users class="h-6 w-6" /></template>
        首页
      </VanTabbarItem>
      <VanTabbarItem v-if="store.hasPermission('menu.coach_annotations')" @click="store.setCurrentView('coach-unannotated-list')" :badge="coachUnannotatedCount > 0 ? coachUnannotatedCount : undefined">
        <template #icon><FileText class="h-6 w-6" /></template>
        批注
      </VanTabbarItem>
      <VanTabbarItem v-if="store.hasPermission('menu.coach_activities')" @click="store.setCurrentView('activity-upload')">
        <template #icon><Dumbbell class="h-6 w-6" /></template>
        发布活动
      </VanTabbarItem>
    </VanTabbar>

    <!-- 运动处方弹窗 -->
    <VanPopup v-model:show="showPrescription" position="bottom" round>
      <div class="max-h-[88vh] overflow-y-auto p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <div class="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200"></div>
        <div class="flex items-start justify-between">
          <div>
            <h3 class="text-lg font-bold text-gray-900">新建运动处方</h3>
            <p class="mt-1 text-xs text-gray-400">{{ activeCampName }} · 提交后由心血管医师签署</p>
          </div>
          <span class="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-[#0B5FD7]">提交医师审核</span>
        </div>

        <div class="mt-4 space-y-3">
          <div>
            <label class="text-[11px] font-bold text-gray-500">选择学员</label>
            <select v-model="prescriptionForm.studentId" class="mt-1.5 w-full rounded-xl border border-gray-200 bg-[#F7F9FC] px-3 py-2.5 text-sm outline-none focus:border-[#0B5FD7]">
              <option value="" disabled>请选择学员</option>
              <option v-for="s in campStudents" :key="s.id" :value="s.id">{{ s.name }} · {{ s.age || '--' }}岁</option>
            </select>
          </div>
          <div>
            <label class="text-[11px] font-bold text-gray-500">运动方式</label>
            <input v-model="prescriptionForm.mode" class="mt-1.5 w-full rounded-xl border border-gray-200 bg-[#F7F9FC] px-3 py-2.5 text-sm outline-none focus:border-[#0B5FD7]" />
          </div>
          <div class="grid grid-cols-3 gap-2">
            <div>
              <label class="text-[10px] font-bold text-gray-500">强度</label>
              <input v-model="prescriptionForm.intensity" class="mt-1.5 w-full rounded-xl border border-gray-200 bg-[#F7F9FC] px-2 py-2.5 text-xs outline-none focus:border-[#0B5FD7]" />
            </div>
            <div>
              <label class="text-[10px] font-bold text-gray-500">频次</label>
              <input v-model="prescriptionForm.freq" class="mt-1.5 w-full rounded-xl border border-gray-200 bg-[#F7F9FC] px-2 py-2.5 text-xs outline-none focus:border-[#0B5FD7]" />
            </div>
            <div>
              <label class="text-[10px] font-bold text-gray-500">时长</label>
              <input v-model="prescriptionForm.duration" class="mt-1.5 w-full rounded-xl border border-gray-200 bg-[#F7F9FC] px-2 py-2.5 text-xs outline-none focus:border-[#0B5FD7]" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-[10px] font-bold text-gray-500">医师确认后心率区间</label>
              <input v-model="prescriptionForm.targetHr" class="mt-1.5 w-full rounded-xl border border-gray-200 bg-[#F7F9FC] px-2 py-2.5 text-xs outline-none focus:border-[#0B5FD7]" />
            </div>
            <div>
              <label class="text-[10px] font-bold text-gray-500">RPE 主观强度</label>
              <select v-model="prescriptionForm.rpe" class="mt-1.5 w-full rounded-xl border border-gray-200 bg-[#F7F9FC] px-2 py-2.5 text-xs outline-none focus:border-[#0B5FD7]">
                <option v-for="option in RPE_PRESCRIPTION_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-[10px] font-bold text-gray-500">热身</label>
              <input v-model="prescriptionForm.warmup" class="mt-1.5 w-full rounded-xl border border-gray-200 bg-[#F7F9FC] px-2 py-2.5 text-xs outline-none focus:border-[#0B5FD7]" />
            </div>
            <div>
              <label class="text-[10px] font-bold text-gray-500">放松</label>
              <input v-model="prescriptionForm.cooldown" class="mt-1.5 w-full rounded-xl border border-gray-200 bg-[#F7F9FC] px-2 py-2.5 text-xs outline-none focus:border-[#0B5FD7]" />
            </div>
          </div>
          <div class="rounded-xl border border-amber-100 bg-amber-50/70 p-3">
            <p class="flex items-center gap-1.5 text-[10px] font-bold text-amber-700">
              <HeartPulse class="w-3.5 h-3.5" /> 停止运动信号
            </p>
            <textarea v-model="prescriptionForm.stopSigns" rows="2" class="mt-1.5 w-full resize-none bg-transparent text-[11px] leading-relaxed text-amber-700/80 outline-none" />
            <input v-model="prescriptionForm.note" class="mt-2 w-full border-t border-amber-100 bg-transparent pt-2 text-[10px] text-amber-700/80 outline-none" placeholder="服药、天气等补充注意事项" />
          </div>
          <p class="text-[10px] text-gray-400">提交后将进入医师签署队列，签署通过后自动同步至学员端。</p>
        </div>

        <div class="mt-5 flex gap-3">
          <button class="flex-1 rounded-xl bg-gray-100 py-3 text-sm font-bold text-gray-500" @click="showPrescription = false">取消</button>
          <button class="flex-[2] rounded-xl bg-[#0B5FD7] py-3 text-sm font-bold text-white active:scale-[0.99]" @click="submitPrescription">提交医师审核</button>
        </div>
      </div>
    </VanPopup>

    <!-- 营期选择弹窗 -->
    <VanPopup v-model:show="showCampPicker" position="bottom" round class="custom-popup">
      <div class="p-4">
        <h3 class="font-bold text-gray-900 text-base mb-3 text-center">选择营期</h3>
        <div class="space-y-2">
          <button
            v-for="camp in coachCamps"
            :key="camp.id"
            @click="selectCamp(camp.id)"
            :class="['w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all', activeCampId === camp.id ? 'border-[#0B5FD7] bg-blue-50 text-[#0B5FD7]' : 'border-gray-200 bg-white text-gray-700 active:bg-gray-50']"
          >
            <div class="flex-1 text-left min-w-0"><span class="font-medium">{{ camp.name }}</span><div class="text-[10px] text-gray-400 mt-0.5">{{ campDateRange(camp) }}</div></div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-400">
                {{ campStudents.filter(s => { const a = store.accounts.find(acc => acc.id === s.id); return a?.campIds?.includes(camp.id); }).length }}人
              </span>
              <span v-if="camp.status === 'active'" class="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-600">进行中</span>
              <span v-else-if="camp.status === 'ended'" class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">已结束</span>
              <span v-else class="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-500">未开始</span>
            </div>
          </button>
        </div>
      </div>
    </VanPopup>
  </div>
</template>
