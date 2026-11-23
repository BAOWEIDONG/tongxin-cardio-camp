<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useAppStore } from '../store/app';
import { NavBar, Card } from './ui';
import type { NutritionPrescription } from '../types';
import { showToast } from 'vant';
import {
  AlertTriangle, ChevronRight, ClipboardList, Coffee, Droplets, Leaf, MessageCircle,
  Pencil, ShieldCheck, Soup, Stethoscope, Utensils, Wheat,
} from 'lucide-vue-next';

type NutritionForm = Omit<NutritionPrescription, 'id' | 'dietitianId' | 'dietitianName' | 'status' | 'createdAt' | 'updatedAt' | 'publishedAt'>;

const store = useAppStore();
const isStudent = computed(() => store.user?.role === 'student');
const isDietitian = computed(() => store.user?.role === 'dietitian');
const canEdit = computed(() => isDietitian.value && store.hasPermission('action.publish_nutrition'));
const studentId = computed(() => isStudent.value ? (store.user?.id || '') : (store.selectedStudentId || ''));
const campId = computed(() => {
  if (isStudent.value) {
    return store.selectedCampId || (studentId.value ? store.getStudentCampId(studentId.value) : null);
  }
  return store.detailSelectedCampId || store.selectedCampId || (studentId.value ? store.getStudentCampId(studentId.value) : null);
});
const studentName = computed(() => {
  if (isStudent.value) return store.user?.name || '学员';
  return store.accounts.find((a) => a.id === studentId.value)?.name || store.students.find((s) => s.id === studentId.value)?.name || '学员';
});
const prescription = computed(() =>
  studentId.value && campId.value ? store.getStudentNutritionPrescription(studentId.value, campId.value) : null,
);
const showEditor = ref(false);
const form = ref<NutritionForm>(emptyForm());

function emptyForm(): NutritionForm {
  return {
    campId: '',
    studentId: '',
    assessment: '结合心血管病史、血压、血脂、肾功能、用药和饮食习惯，营养师填写评估结论。',
    energyTarget: '个体化能量目标',
    proteinTarget: '优质蛋白目标',
    saltTarget: '<5 g 盐/日',
    oilTarget: '25–30 g/日',
    fiberTarget: '25–30 g/日',
    fluidTarget: '1500–1800 ml/日',
    breakfast: '燕麦/全麦主食 + 鸡蛋或奶 + 蔬菜',
    lunch: '杂粮主食 + 鱼/禽/豆制品 + 两份蔬菜',
    dinner: '适量主食 + 清淡蛋白 + 蔬菜，少盐少油',
    snack: '无糖酸奶或原味坚果',
    restrictions: '他汀期间避免大量西柚汁；服用华法林时绿叶菜摄入保持稳定；不自行停药。',
    followupPlan: '每周复盘饮食记录，第6个月复查后调整。',
  };
}

function loadForm() {
  const p = prescription.value;
  form.value = p
    ? {
        campId: p.campId,
        studentId: p.studentId,
        assessment: p.assessment,
        energyTarget: p.energyTarget,
        proteinTarget: p.proteinTarget,
        saltTarget: p.saltTarget,
        oilTarget: p.oilTarget,
        fiberTarget: p.fiberTarget,
        fluidTarget: p.fluidTarget,
        breakfast: p.breakfast,
        lunch: p.lunch,
        dinner: p.dinner,
        snack: p.snack,
        restrictions: p.restrictions,
        followupPlan: p.followupPlan,
      }
    : emptyForm();
}
watch(prescription, loadForm, { immediate: true });

function publish() {
  if (!studentId.value || !campId.value) {
    showToast('请先选择学员');
    return;
  }
  const saved = store.publishNutritionPrescription({
    ...form.value,
    campId: campId.value,
    studentId: studentId.value,
    dietitianName: store.user?.name || '营养师',
  });
  if (!saved) {
    showToast('当前账号未开通营养处方发布权限');
    return;
  }
  showEditor.value = false;
  showToast({ message: '营养处方已发布，学员端和团队随访已同步', position: 'top' });
}

function openChat() {
  if (!studentId.value || !campId.value) return;
  store.openChatForStudent(studentId.value, campId.value);
}
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] pb-28 font-sans">
    <NavBar :title="isStudent ? '我的饮食处方' : '营养评估与饮食处方'" :on-back="store.goBack">
      <template #right>
        <button v-if="canEdit" class="flex items-center gap-1 rounded-full bg-[#0B5FD7] px-3 py-1.5 text-[11px] font-bold text-white" @click="showEditor = !showEditor">
          <Pencil class="h-3.5 w-3.5" />{{ showEditor ? '收起编辑' : prescription?.status === 'published' ? '修订处方' : '开具处方' }}
        </button>
      </template>
    </NavBar>

    <div v-if="!studentId" class="flex flex-1 items-center justify-center px-8 text-center text-sm text-gray-400">
      请先从学员列表选择一位学员
    </div>

    <div v-else class="space-y-4 p-4">
      <div class="rounded-2xl bg-gradient-to-br from-[#0B5FD7] to-[#084C9E] p-4 text-white shadow-md shadow-blue-100">
        <div class="flex items-center gap-2">
          <Leaf class="h-4 w-4" />
          <span class="text-xs font-bold">心血管慢病营养管理</span>
        </div>
        <h2 class="mt-2 text-lg font-black">{{ studentName }} 的个体化饮食处方</h2>
        <p class="mt-1 text-[10px] leading-relaxed text-blue-100">
          重点管理血压、LDL-C、水肿和用药-饮食相互作用，不以减重速度为核心目标。
        </p>
        <div class="mt-3 flex items-center justify-between rounded-xl bg-white/10 px-3 py-2 text-[10px]">
          <span>{{ prescription?.status === 'published' ? '已发布 · 学员可见' : prescription ? '草稿 · 待发布' : '尚未开具' }}</span>
          <span v-if="prescription?.publishedAt">{{ prescription.publishedAt.slice(0, 10) }}</span>
        </div>
      </div>

      <div v-if="!prescription && !showEditor" class="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs leading-relaxed text-amber-700">
        <div class="mb-1 flex items-center gap-2 font-bold"><AlertTriangle class="h-4 w-4" /> 尚未发布饮食处方</div>
        营养师需先完成评估，再结合血压、血脂、肾功能和长期用药开具个体化食谱。学员端在发布前只能查看通用低盐少油建议。
      </div>

      <Card v-if="showEditor && canEdit" class="space-y-4 border border-blue-100">
        <div class="flex items-center gap-2 text-sm font-bold text-gray-900">
          <Stethoscope class="h-4 w-4 text-[#0B5FD7]" /> 营养评估与处方编辑
        </div>
        <div class="rounded-xl bg-blue-50/60 p-3 text-[10px] leading-relaxed text-[#0B5FD7]">
          必须核对：近期血压、LDL-C、肾功能/血钾、是否服用他汀或华法林、有无食物过敏及特殊饮食要求。
        </div>
        <label class="block space-y-1">
          <span class="text-[11px] font-bold text-gray-700">营养评估结论</span>
          <textarea v-model="form.assessment" rows="3" class="w-full rounded-xl border border-gray-200 p-3 text-xs outline-none focus:border-[#0B5FD7]"></textarea>
        </label>
        <div class="grid grid-cols-2 gap-3">
          <label class="space-y-1"><span class="text-[10px] font-bold text-gray-600">能量目标</span><input v-model="form.energyTarget" class="w-full rounded-lg border border-gray-200 p-2.5 text-xs outline-none focus:border-[#0B5FD7]" /></label>
          <label class="space-y-1"><span class="text-[10px] font-bold text-gray-600">蛋白质目标</span><input v-model="form.proteinTarget" class="w-full rounded-lg border border-gray-200 p-2.5 text-xs outline-none focus:border-[#0B5FD7]" /></label>
          <label class="space-y-1"><span class="text-[10px] font-bold text-gray-600">盐</span><input v-model="form.saltTarget" class="w-full rounded-lg border border-gray-200 p-2.5 text-xs outline-none focus:border-[#0B5FD7]" /></label>
          <label class="space-y-1"><span class="text-[10px] font-bold text-gray-600">烹调油</span><input v-model="form.oilTarget" class="w-full rounded-lg border border-gray-200 p-2.5 text-xs outline-none focus:border-[#0B5FD7]" /></label>
          <label class="space-y-1"><span class="text-[10px] font-bold text-gray-600">膳食纤维</span><input v-model="form.fiberTarget" class="w-full rounded-lg border border-gray-200 p-2.5 text-xs outline-none focus:border-[#0B5FD7]" /></label>
          <label class="space-y-1"><span class="text-[10px] font-bold text-gray-600">饮水</span><input v-model="form.fluidTarget" class="w-full rounded-lg border border-gray-200 p-2.5 text-xs outline-none focus:border-[#0B5FD7]" /></label>
        </div>
        <div class="space-y-2">
          <div class="text-[11px] font-bold text-gray-700">三餐示例</div>
          <label class="flex items-start gap-2"><span class="mt-2 w-8 shrink-0 text-[10px] font-bold text-[#0B5FD7]">早餐</span><textarea v-model="form.breakfast" rows="2" class="w-full rounded-lg border border-gray-200 p-2.5 text-xs outline-none focus:border-[#0B5FD7]"></textarea></label>
          <label class="flex items-start gap-2"><span class="mt-2 w-8 shrink-0 text-[10px] font-bold text-[#0B5FD7]">午餐</span><textarea v-model="form.lunch" rows="2" class="w-full rounded-lg border border-gray-200 p-2.5 text-xs outline-none focus:border-[#0B5FD7]"></textarea></label>
          <label class="flex items-start gap-2"><span class="mt-2 w-8 shrink-0 text-[10px] font-bold text-[#0B5FD7]">晚餐</span><textarea v-model="form.dinner" rows="2" class="w-full rounded-lg border border-gray-200 p-2.5 text-xs outline-none focus:border-[#0B5FD7]"></textarea></label>
          <label class="flex items-start gap-2"><span class="mt-2 w-8 shrink-0 text-[10px] font-bold text-[#0B5FD7]">加餐</span><textarea v-model="form.snack" rows="2" class="w-full rounded-lg border border-gray-200 p-2.5 text-xs outline-none focus:border-[#0B5FD7]"></textarea></label>
        </div>
        <label class="block space-y-1"><span class="text-[11px] font-bold text-gray-700">忌口与用药-饮食相互作用</span><textarea v-model="form.restrictions" rows="3" class="w-full rounded-xl border border-gray-200 p-3 text-xs outline-none focus:border-[#0B5FD7]"></textarea></label>
        <label class="block space-y-1"><span class="text-[11px] font-bold text-gray-700">随访计划</span><textarea v-model="form.followupPlan" rows="2" class="w-full rounded-xl border border-gray-200 p-3 text-xs outline-none focus:border-[#0B5FD7]"></textarea></label>
        <button class="w-full rounded-xl bg-[#0B5FD7] py-3 text-sm font-bold text-white" @click="publish">
          发布处方并通知学员
        </button>
      </Card>

      <template v-if="prescription && !showEditor">
        <Card class="space-y-3">
          <div class="flex items-center gap-2 border-b border-gray-100 pb-2 text-sm font-bold text-gray-900">
            <ClipboardList class="h-4 w-4 text-[#0B5FD7]" /> 营养评估
          </div>
          <p class="text-[11px] leading-relaxed text-gray-600">{{ prescription.assessment }}</p>
          <div class="grid grid-cols-3 gap-2">
            <div class="rounded-xl bg-blue-50/70 p-2 text-center"><Utensils class="mx-auto h-4 w-4 text-[#0B5FD7]" /><div class="mt-1 text-[9px] text-gray-400">盐</div><div class="text-[10px] font-bold text-gray-800">{{ prescription.saltTarget }}</div></div>
            <div class="rounded-xl bg-amber-50/70 p-2 text-center"><Soup class="mx-auto h-4 w-4 text-amber-600" /><div class="mt-1 text-[9px] text-gray-400">烹调油</div><div class="text-[10px] font-bold text-gray-800">{{ prescription.oilTarget }}</div></div>
            <div class="rounded-xl bg-emerald-50/70 p-2 text-center"><Wheat class="mx-auto h-4 w-4 text-emerald-600" /><div class="mt-1 text-[9px] text-gray-400">膳食纤维</div><div class="text-[10px] font-bold text-gray-800">{{ prescription.fiberTarget }}</div></div>
          </div>
          <div class="grid grid-cols-2 gap-2 text-[10px]">
            <div class="rounded-lg bg-gray-50 px-3 py-2"><span class="text-gray-400">能量：</span>{{ prescription.energyTarget }}</div>
            <div class="rounded-lg bg-gray-50 px-3 py-2"><span class="text-gray-400">蛋白质：</span>{{ prescription.proteinTarget }}</div>
            <div class="col-span-2 rounded-lg bg-gray-50 px-3 py-2"><span class="text-gray-400">饮水：</span>{{ prescription.fluidTarget }}</div>
          </div>
        </Card>

        <Card class="space-y-2">
          <div class="flex items-center gap-2 border-b border-gray-100 pb-2 text-sm font-bold text-gray-900">
            <Coffee class="h-4 w-4 text-[#0B5FD7]" /> 一日食谱建议
          </div>
          <div v-for="row in [
            { label: '早餐', value: prescription.breakfast },
            { label: '午餐', value: prescription.lunch },
            { label: '晚餐', value: prescription.dinner },
            { label: '加餐', value: prescription.snack },
          ]" :key="row.label" class="flex items-start gap-3 rounded-xl bg-gray-50 px-3 py-2.5">
            <span class="w-8 shrink-0 text-[10px] font-bold text-[#0B5FD7]">{{ row.label }}</span>
            <span class="text-[11px] leading-relaxed text-gray-700">{{ row.value }}</span>
          </div>
        </Card>

        <Card class="space-y-3">
          <div class="flex items-center gap-2 border-b border-gray-100 pb-2 text-sm font-bold text-gray-900">
            <ShieldCheck class="h-4 w-4 text-red-500" /> 忌口与用药相互作用
          </div>
          <p class="text-[11px] leading-relaxed text-gray-600">{{ prescription.restrictions }}</p>
          <div class="rounded-xl border border-amber-100 bg-amber-50/80 p-3 text-[10px] leading-relaxed text-amber-700">
            <p class="font-bold">请勿自行停用降压、降脂或抗凝药物</p>
            <p class="mt-1">如出现肌肉疼痛、黑便、头晕或血压持续 ≥180/110，请停止运动并联系医师，必要时拨打 120 或到院。</p>
          </div>
        </Card>

        <Card class="space-y-2">
          <div class="flex items-center gap-2 text-sm font-bold text-gray-900"><Droplets class="h-4 w-4 text-[#0B5FD7]" /> 随访计划</div>
          <p class="text-[11px] leading-relaxed text-gray-600">{{ prescription.followupPlan }}</p>
          <p class="text-[9px] text-gray-400">处方由 {{ prescription.dietitianName }} 于 {{ prescription.updatedAt.slice(0, 16) }} 更新</p>
        </Card>

        <div class="flex gap-2">
          <button class="flex flex-1 items-center justify-center gap-1 rounded-xl border border-[#0B5FD7]/20 bg-white py-3 text-xs font-bold text-[#0B5FD7]" @click="openChat">
            <MessageCircle class="h-4 w-4" /> 咨询营养师
          </button>
          <button v-if="isStudent" class="flex flex-1 items-center justify-center gap-1 rounded-xl bg-[#0B5FD7] py-3 text-xs font-bold text-white" @click="store.setCurrentView('diet')">
            去记录三餐 <ChevronRight class="h-4 w-4" />
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
