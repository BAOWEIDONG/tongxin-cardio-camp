<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAppStore, type View } from '../store/app';
import { showToast } from 'vant';
import { Check, ChevronDown, ChevronRight, CircleDashed, HeartPulse, ShieldCheck, Stethoscope } from 'lucide-vue-next';

const props = defineProps<{
  studentId?: string | null;
  campId?: string | null;
  subjectName?: string;
}>();

const store = useAppStore();
const expanded = ref(false);
const sid = computed(() => props.studentId || store.user?.id || '');
const cid = computed(() => props.campId || store.selectedCampId || store.getStudentCampId(sid.value));
const flow = computed(() => store.getServiceFlow(sid.value, cid.value));
const steps = computed(() => {
  if (expanded.value) return flow.value.steps;
  const currentIndex = Math.max(0, flow.value.steps.findIndex((s) => s.key === flow.value.currentKey));
  return flow.value.steps.slice(Math.max(0, currentIndex - 1), currentIndex + 2);
});

const role = computed(() => store.user?.role || 'student');
const roleText = computed(() => ({
  student: '您负责资料、打卡与反馈；团队负责风险评估、双处方、批注和随访。',
  doctor: '您负责风险分层、运动处方签署、随访干预与阶段复查结论。',
  coach: '您负责运动能力评估、处方提交、运动批注和第 6 个月复评。',
  dietitian: '您负责营养评估、饮食处方、逐餐批注与用药-饮食相互作用核对。',
}[role.value]));
const actionLabel = computed(() => ({
  student: '查看我的健康任务',
  doctor: '进入医师待办',
  coach: '进入康复师待办',
  dietitian: '进入营养师待办',
}[role.value]));
const actionView = computed<View>(() => ({
  student: 'health-profile' as View,
  doctor: 'doctor-dashboard' as View,
  coach: 'coach-dashboard' as View,
  dietitian: 'dietitian-dashboard' as View,
}[role.value]));
const statusText = computed(() => ({ done: '已完成', active: '当前节点', waiting: '待处理' }[flow.value.steps.find((s) => s.key === flow.value.currentKey)?.status || 'waiting']));
const currentStep = computed(() => flow.value.steps.find((s) => s.key === flow.value.currentKey));
const progress = computed(() => Math.round((flow.value.completed / flow.value.total) * 100));

function go() {
  if (store.canAccessView(actionView.value)) {
    store.setCurrentView(actionView.value);
    return;
  }
  showToast('当前账号未开通该入口，请联系管理员配置权限');
}

function goStep(view: View) {
  if (!store.canAccessView(view)) {
    showToast('该节点由对应角色处理，当前账号仅可查看流程');
    return;
  }
  store.setCurrentView(view);
}
</script>

<template>
  <div class="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_4px_18px_-10px_rgba(11,95,215,0.35)]">
    <div class="bg-gradient-to-r from-[#0B5FD7] to-[#084C9E] px-4 pb-3 pt-3.5 text-white">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <HeartPulse class="h-4 w-4" />
          <span class="text-sm font-bold">心血管营服务流转</span>
          <span v-if="subjectName" class="rounded-full bg-white/15 px-1.5 py-0.5 text-[9px] font-semibold">{{ subjectName }}</span>
        </div>
        <span class="rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-bold">{{ flow.completed }}/{{ flow.total }} 已完成</span>
      </div>
      <p class="mt-1.5 text-[10px] leading-relaxed text-blue-100">{{ roleText }}</p>
      <div class="mt-2.5 h-1 overflow-hidden rounded-full bg-white/20">
        <div class="h-full rounded-full bg-[#F6C453] transition-all duration-500" :style="{ width: `${progress}%` }"></div>
      </div>
      <div class="mt-2 flex items-center justify-between text-[10px]">
        <span class="rounded-full bg-white/15 px-2 py-0.5 font-bold">{{ statusText }} · {{ currentStep?.label }}</span>
        <span class="text-blue-100">负责人：{{ currentStep?.owner }}</span>
      </div>
    </div>

    <div class="px-4 py-3">
      <p class="mb-2 text-[10px] leading-relaxed text-gray-500">{{ currentStep?.detail }}</p>
      <div class="relative space-y-2">
        <button
          v-for="(step, index) in steps"
          :key="step.key"
          class="flex w-full items-start gap-2.5 rounded-xl px-2 py-2 text-left transition-colors active:bg-blue-50/60"
          :class="step.status === 'active' ? 'bg-blue-50/70' : ''"
          @click="step.actionView ? goStep(step.actionView) : undefined"
        >
          <div
            class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border"
            :class="step.status === 'done'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
              : step.status === 'active'
                ? 'border-[#0B5FD7] bg-[#0B5FD7] text-white'
                : 'border-gray-200 bg-gray-50 text-gray-400'"
          >
            <Check v-if="step.status === 'done'" class="h-3.5 w-3.5" />
            <CircleDashed v-else-if="step.status === 'active'" class="h-3.5 w-3.5" />
            <span v-else class="text-[10px] font-bold">{{ index + 1 }}</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <span class="text-[11px] font-bold" :class="step.status === 'active' ? 'text-[#0B5FD7]' : 'text-gray-800'">{{ step.label }}</span>
              <span v-if="step.status === 'active'" class="rounded-full bg-[#0B5FD7]/10 px-1.5 py-0.5 text-[8px] font-bold text-[#0B5FD7]">当前</span>
            </div>
            <div class="mt-0.5 flex items-center gap-1 text-[9px] text-gray-400">
              <Stethoscope v-if="step.owner.includes('医师')" class="h-3 w-3" />
              <ShieldCheck v-else class="h-3 w-3" />
              {{ step.owner }}
              <span class="rounded-full bg-gray-100 px-1.5 py-0.5 text-[8px] text-gray-500">{{ step.mode }}</span>
            </div>
          </div>
          <ChevronRight v-if="step.actionView" class="mt-2 h-3.5 w-3.5 shrink-0 text-gray-300" />
        </button>
      </div>

      <div class="mt-2 flex items-center gap-2">
        <button class="flex flex-1 items-center justify-center gap-1 rounded-xl bg-[#0B5FD7] py-2.5 text-[11px] font-bold text-white active:scale-[0.99]" @click="go">
          {{ actionLabel }} <ChevronRight class="h-3.5 w-3.5" />
        </button>
        <button class="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2.5 text-[10px] font-bold text-gray-500" @click="expanded = !expanded">
          {{ expanded ? '收起' : '全部节点' }} <ChevronDown class="h-3.5 w-3.5 transition-transform" :class="expanded ? 'rotate-180' : ''" />
        </button>
      </div>
    </div>
  </div>
</template>
