<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { format } from 'date-fns';
import { useAppStore, questionnaireStorageKey } from '../store/app';
import { uploadFile } from '../lib/api';
import { compressImage } from '../lib/imageCompress';
import { NavBar, Card, StudentTabbar } from './ui';
import { Activity, FileText, ClipboardList, Stethoscope, UploadCloud, X, Pencil, ChevronRight, ChevronDown, Leaf, ShieldCheck, MessageCircle, HeartPulse, Plus } from 'lucide-vue-next';
import { Popup as VanPopup, TimePicker as VanTimePicker, showToast } from 'vant';
import { buildMedicalData } from '../lib/medicalData';
import { MOCK_METRIC_VALUES } from '../mock/data';

const store = useAppStore();
const profileCampId = computed(() =>
  store.selectedCampId || (store.user?.id ? store.getStudentCampId(store.user.id) : null),
);
const bpRecords = computed(() =>
  store.user?.id ? store.getStudentBpRecords(store.user.id, profileCampId.value) : [],
);
const latestBp = computed(() => bpRecords.value[0] || null);
const bpRecordDays = computed(() => new Set(bpRecords.value.map((r) => r.date.slice(0, 10))).size);
const bpWeekProgress = computed(() => Math.min(bpRecordDays.value / 7, 1));
const showBpForm = ref(false);
const bpForm = reactive({ sbp: '', dbp: '', pulse: '', note: '' });
const bpFormError = ref('');
function openBpForm() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  bpForm.sbp = latestBp.value ? String(latestBp.value.sbp) : '';
  bpForm.dbp = latestBp.value ? String(latestBp.value.dbp) : '';
  bpForm.pulse = latestBp.value?.pulse ? String(latestBp.value.pulse) : '';
  bpForm.note = `${now.getHours() < 12 ? '晨起' : '晚间'}静坐 5 分钟后测量`;
  bpFormError.value = '';
  showBpForm.value = true;
}
function saveBp() {
  if (!profileCampId.value) return;
  const sbp = Number(bpForm.sbp);
  const dbp = Number(bpForm.dbp);
  if (!Number.isFinite(sbp) || !Number.isFinite(dbp) || sbp <= dbp) {
    bpFormError.value = '请填写有效的收缩压/舒张压，收缩压应高于舒张压';
    return;
  }
  const rec = store.addBpRecord({
    campId: profileCampId.value,
    date: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
    sbp,
    dbp,
    pulse: bpForm.pulse ? Number(bpForm.pulse) : null,
    note: bpForm.note.trim(),
  });
  if (!rec) {
    bpFormError.value = '数值超出可记录范围，请核对后重试；如血压 ≥180/110 请立即联系团队';
    return;
  }
  showBpForm.value = false;
  showToast(rec.sbp >= 180 || rec.dbp >= 110 ? '已记录，血压偏高，请立即联系医师团队' : '血压已记录');
}
// 入营问卷数据按当前学员隔离读取/写入，防止新账户串用他人问卷
const qKey = (kind: 'submitted' | 'draft') => questionnaireStorageKey(kind, store.user?.id || 'none');
const REPORT_CATEGORIES = [
  { value: 'diagnosis', label: '确诊病历' },
  { value: 'labs', label: '化验报告' },
  { value: 'ecg', label: '心电图/心电监测' },
  { value: 'other', label: '其他检查' },
] as const;
const reportCategoryLabel = (value?: string) =>
  REPORT_CATEGORIES.find((c) => c.value === value)?.label || '其他检查';

// 未读批注数（tabbar badge）
// 消息未读数（批注 + 系统通知，store 级统一，与各学员页「消息」Tab 角标一致）
const unreadCount = computed(() =>
  store.user?.role === 'student' ? store.getStudentMsgUnreadCount(store.user.id) : 0,
);

// Build medical data from dynamic configs + per-student mock values, with gender-aware abnormal detection
const medicalData = computed(() => {
  const studentId = store.user?.id;
  const campId = store.selectedCampId || (studentId ? store.getStudentCampId(studentId) : null);
  const stages = studentId
    ? store.getMetricStageValues(studentId, campId)
    : { baseline: {}, midterm: {}, closeout: {} };
  const source = (studentId && store.getEffectiveMetricValues(studentId, campId)) || MOCK_METRIC_VALUES;
  const values = Object.fromEntries(
    Object.keys(source).map((key) => [key, {
      beforeValue: stages.baseline[key] ?? source[key]?.beforeValue ?? null,
      afterValue: stages.closeout[key] ?? source[key]?.afterValue ?? null,
    }]),
  );
  return buildMedicalData(store.metricConfigs, values, store.user?.gender, stages.midterm);
});

const cardioMetricItems = computed(() =>
  medicalData.value.find((cat: any) => cat.title === '心血管相关')?.items || [],
);
const medicationText = computed(() => {
  if (!qData.value?.hasMedication || qData.value.hasMedication === '无') return '暂未记录长期用药';
  return qData.value.medicationDetails || '已记录用药，具体名称待医护核对';
});
const consentRecord = computed(() => store.user?.id ? store.getStudentConsent(store.user.id) : null);
const latestDoctorFollowup = computed(() => {
  if (!store.user?.id) return null;
  return store.getLatestDoctorFollowup(store.user.id, store.selectedCampId || store.getStudentCampId(store.user.id));
});
const nutritionPrescription = computed(() => {
  if (!store.user?.id) return null;
  return store.getStudentNutritionPrescription(store.user.id, store.selectedCampId || store.getStudentCampId(store.user.id));
});

// Collapsible category state - default all expanded (empty set = nothing collapsed)
const collapsedCats = ref<Set<string>>(new Set());
const toggleCat = (title: string) => {
  const next = new Set(collapsedCats.value);
  if (next.has(title)) next.delete(title);
  else next.add(title);
  collapsedCats.value = next;
};

const qData = ref<any>(null);
const showUploadModal = ref(false);
const pendingReports = ref<{ url: string; type: 'image' | 'pdf'; name?: string; category?: 'diagnosis' | 'labs' | 'ecg' | 'other'; uploadedAt?: string }[]>([]);
const reportCategory = ref<'diagnosis' | 'labs' | 'ecg' | 'other'>('diagnosis');
const uploadInputRef = ref<HTMLInputElement | null>(null);

// 编辑状态
const showEditBasic = ref(false);
const showEditLifestyle = ref(false);
const editForm = ref<any>({});
// 编辑弹窗校验提示（口径与入营问卷一致）
const editError = ref('');

// 规范化旧版问卷数据（统一选项值）
function normalizeQData(raw: any): any {
  if (!raw) return raw;
  const d = { ...raw };
  // 兼容旧版 snack 值
  if (d.snack === '很少') d.snack = '否';
  else if (d.snack === '经常') d.snack = '是';
  // 兼容旧版 drinkAlcohol/smoke 值
  if (d.drinkAlcohol === '无') d.drinkAlcohol = '从不';
  if (d.smoke === '无') d.smoke = '从不';
  return d;
}

onMounted(() => {
  const saved = localStorage.getItem(qKey('submitted')) || localStorage.getItem(qKey('draft'));
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      const normalized = normalizeQData(parsed.formData || parsed);
      if (normalized && typeof normalized === 'object') qData.value = normalized;
    } catch (e) {
      // ignore
    }
  }
});

function persistQuestionnaire(data: any) {
  try {
    localStorage.setItem(qKey('submitted'), JSON.stringify(data));
  } catch (e) {
    // ignore
  }
}

const handleUploadReport = () => {
  pendingReports.value = [];
  reportCategory.value = 'diagnosis';
  showUploadModal.value = true;
};

const handleModalFileSelect = async (e: Event) => {
  const files = Array.from((e.target as HTMLInputElement).files || []) as File[];
  if (files.length === 0) return;
  const newReports = await Promise.all(
    files.map(async (f) => ({
      url: await uploadFile(await compressImage(f)),
      type: (f.type === 'application/pdf' ? 'pdf' : 'image') as 'image' | 'pdf',
      name: f.name,
      category: reportCategory.value,
      uploadedAt: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
    })),
  );
  pendingReports.value = [...pendingReports.value, ...newReports];
  (e.target as HTMLInputElement).value = '';
};

const handleConfirmUpload = () => {
  if (pendingReports.value.length === 0) return;
  const updated = [...(qData.value?.medicalReports || []), ...pendingReports.value];
  const newQData = { ...(qData.value || {}), medicalReports: updated };
  qData.value = newQData;
  try {
    localStorage.setItem(qKey('submitted'), JSON.stringify(newQData));
  } catch (e) {
    // ignore
  }
  pendingReports.value = [];
  showUploadModal.value = false;
};

const removePendingReport = (idx: number) => {
  pendingReports.value = pendingReports.value.filter((_, i) => i !== idx);
};

const openReport = (r: any) => {
  if (r.type === 'pdf') window.open(r.url, '_blank');
  else store.openImagePreview([r.url], 0);
};

// ─── 编辑功能 ─────────────────────────────────────
function openEditBasic() {
  editForm.value = {
    // 与入营问卷 Step1 字段对齐：补年龄（优先回显问卷已填值，其次用户资料）
    age: qData.value?.age || (store.user?.age ? String(store.user.age) : ''),
    gender: store.user?.gender || 'male',
    height: qData.value?.height || '',
    weight: qData.value?.weight || '',
    hasChronic: qData.value?.hasChronic || '无',
    chronicDetails: qData.value?.chronicDetails || '',
    hasSpecialDiet: qData.value?.hasSpecialDiet || '无',
    specialDietDetails: qData.value?.specialDietDetails || '',
    hasFoodAllergy: qData.value?.hasFoodAllergy || '无',
    foodAllergyDetails: qData.value?.foodAllergyDetails || '',
  };
  editError.value = '';
  showEditBasic.value = true;
}

function openEditLifestyle() {
  const types = qData.value?.exerciseTypes;
  editForm.value = {
    sleepTime: qData.value?.sleepTime || '',
    wakeTime: qData.value?.wakeTime || '',
    sleepDuration: qData.value?.sleepDuration || '',
    drinkAlcohol: qData.value?.drinkAlcohol || '从不',
    smoke: qData.value?.smoke || '从不',
    snack: qData.value?.snack || '否',
    dailyWater: qData.value?.dailyWater || '',
    exerciseFrequency: qData.value?.exerciseFrequency || '',
    exerciseDuration: qData.value?.exerciseDuration || '',
    exerciseTypesStr: Array.isArray(types) ? types.join(', ') : (types || ''),
  };
  editError.value = '';
  showEditLifestyle.value = true;
}

function saveBasic() {
  // 校验口径与入营问卷 Step1/Step2 一致
  const a = parseInt(editForm.value.age);
  const h = parseFloat(editForm.value.height);
  const w = parseFloat(editForm.value.weight);
  if (!editForm.value.age || !editForm.value.height || !editForm.value.weight) {
    editError.value = '请完善所有必填信息';
    return;
  }
  if (isNaN(a) || a < 1 || a > 120) { editError.value = '请输入正确的年龄'; return; }
  if (h < 100 || h > 250) { editError.value = '身高需在100-250cm之间'; return; }
  if (w < 20 || w > 300) { editError.value = '体重需在20-300kg之间'; return; }
  if (editForm.value.hasChronic === '有' && !(editForm.value.chronicDetails || '').trim()) { editError.value = '请填写疾病名称'; return; }
  if (editForm.value.hasSpecialDiet === '有' && !(editForm.value.specialDietDetails || '').trim()) { editError.value = '请说明特殊饮食内容'; return; }
  if (editForm.value.hasFoodAllergy === '有' && !(editForm.value.foodAllergyDetails || '').trim()) { editError.value = '请列出过敏食物'; return; }

  // 同步 性别/年龄/身高/体重 到 store（user + students + camp_auth），与入营问卷提交口径一致
  store.updateUserProfile({ gender: editForm.value.gender, age: a, height: h, weight: w });
  const newQData = { ...(qData.value || {}), ...editForm.value };
  // 清理：如果选"无"，清空详情
  if (newQData.hasChronic === '无') newQData.chronicDetails = '';
  if (newQData.hasSpecialDiet === '无') newQData.specialDietDetails = '';
  if (newQData.hasFoodAllergy === '无') newQData.foodAllergyDetails = '';
  qData.value = newQData;
  persistQuestionnaire(newQData);
  editError.value = '';
  showEditBasic.value = false;
}

function saveLifestyle() {
  // 校验口径与入营问卷 Step3/Step4 一致
  const sd = parseFloat(editForm.value.sleepDuration);
  const dw = parseInt(editForm.value.dailyWater);
  const ef = parseInt(editForm.value.exerciseFrequency);
  const ed = parseInt(editForm.value.exerciseDuration);
  if (!editForm.value.sleepTime || !editForm.value.wakeTime || !editForm.value.sleepDuration ||
      !editForm.value.drinkAlcohol || !editForm.value.smoke || !editForm.value.snack || !editForm.value.dailyWater ||
      !editForm.value.exerciseFrequency || !editForm.value.exerciseDuration) {
    editError.value = '请回答所有必填问题';
    return;
  }
  if (isNaN(sd) || sd < 0 || sd > 24) { editError.value = '睡眠时长需在0-24小时之间'; return; }
  if (isNaN(dw) || dw < 0 || dw > 10000) { editError.value = '饮水量需在0-10000ml之间'; return; }
  if (isNaN(ef) || ef < 0 || ef > 21) { editError.value = '每周运动频率需在0-21次之间'; return; }
  if (isNaN(ed) || ed < 0 || ed > 600) { editError.value = '每次运动时长需在0-600分钟之间'; return; }
  const typesStr = editForm.value.exerciseTypesStr || '';
  const types = typesStr.split(/[,，]/).map((s: string) => s.trim()).filter(Boolean);
  if (types.length === 0) { editError.value = '请至少填写一种运动类型'; return; }
  const newQData = {
    ...(qData.value || {}),
    sleepTime: editForm.value.sleepTime,
    wakeTime: editForm.value.wakeTime,
    sleepDuration: editForm.value.sleepDuration,
    drinkAlcohol: editForm.value.drinkAlcohol,
    smoke: editForm.value.smoke,
    snack: editForm.value.snack,
    dailyWater: editForm.value.dailyWater,
    exerciseFrequency: editForm.value.exerciseFrequency,
    exerciseDuration: editForm.value.exerciseDuration,
    exerciseTypes: types,
  };
  qData.value = newQData;
  persistQuestionnaire(newQData);
  editError.value = '';
  showEditLifestyle.value = false;
}

// ─── 时间选择器 ───────────────────────────────────
const showTimePicker = ref(false);
const timePickerField = ref<'sleepTime' | 'wakeTime'>('sleepTime');
const timePickerValue = ref<string[]>(['23', '00']);

function openTimePicker(field: 'sleepTime' | 'wakeTime') {
  timePickerField.value = field;
  const current = editForm.value[field] || '';
  if (current && current.includes(':')) {
    timePickerValue.value = current.split(':');
  } else {
    timePickerValue.value = field === 'sleepTime' ? ['23', '00'] : ['07', '00'];
  }
  showTimePicker.value = true;
}

function onTimePickerConfirm({ selectedValues }: { selectedValues: string[] }) {
  editForm.value[timePickerField.value] = selectedValues.join(':');
  showTimePicker.value = false;
}
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] pb-28 font-sans">
    <!-- 上传报告弹窗 -->
    <VanPopup v-model:show="showUploadModal" position="center" closeable close-icon-position="top-right" class="custom-popup">
      <div class="p-5 max-h-[85vh]">
        <h3 class="font-bold text-gray-900 mb-3">上传个人医疗报告</h3>
        <p class="text-xs text-gray-500 mb-3">可上传体检报告图片或 PDF，支持拍照或本地选择。</p>
        <div class="mb-3 flex flex-wrap gap-1.5">
          <button
            v-for="c in REPORT_CATEGORIES"
            :key="c.value"
            class="rounded-full border px-2.5 py-1 text-[10px] font-bold"
            :class="reportCategory === c.value ? 'border-[#0B5FD7] bg-[#0B5FD7] text-white' : 'border-gray-200 bg-white text-gray-500'"
            @click="reportCategory = c.value"
          >{{ c.label }}</button>
        </div>
        <input ref="uploadInputRef" type="file" accept="image/*,application/pdf" multiple class="hidden" @change="handleModalFileSelect" />
        <button @click="uploadInputRef?.click()" class="w-full py-6 border-2 border-dashed border-[#0B5FD7]/40 bg-[#0B5FD7]/5 rounded-xl text-[#0B5FD7] flex flex-col items-center gap-1 hover:bg-[#0B5FD7]/10 transition-colors">
          <UploadCloud class="w-6 h-6" />
          <span class="text-xs">点击选择文件 / 拍照</span>
        </button>
        <div v-if="pendingReports.length > 0" class="grid grid-cols-3 gap-2 mt-3">
          <div v-for="(r, idx) in pendingReports" :key="idx" class="relative aspect-[3/4] rounded-lg overflow-hidden border border-gray-200">
            <div v-if="r.type === 'pdf'" class="w-full min-h-full flex flex-col items-center justify-center bg-gray-50 text-[#0B5FD7]">
              <FileText class="w-6 h-6 mb-1" />
              <span class="text-[9px] text-gray-500 truncate px-1">{{ r.name || 'PDF' }}</span>
            </div>
            <img loading="lazy" decoding="async" v-else :src="r.url" alt="预览" class="w-full min-h-full object-cover" />
            <button @click="removePendingReport(idx)" class="absolute top-1 right-1 bg-black/50 rounded-full p-1 text-white"><X class="w-3 h-3" /></button>
          </div>
        </div>
        <div class="flex gap-2 mt-4">
          <button @click="showUploadModal = false; pendingReports = []" class="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm">取消</button>
          <button @click="handleConfirmUpload" :disabled="pendingReports.length === 0" class="flex-1 py-2 rounded-lg bg-[#0B5FD7] text-white text-sm disabled:opacity-50">确定上传</button>
        </div>
      </div>
    </VanPopup>

    <!-- 编辑基础与健康信息弹窗 -->
    <VanPopup v-model:show="showEditBasic" position="bottom" round closeable close-icon-position="top-right" class="custom-popup" :style="{ maxHeight: '85vh' }">
      <div class="p-5 pb-8">
        <h3 class="font-bold text-gray-900 mb-4 text-center">编辑基础与健康信息</h3>
        <div class="space-y-4">
          <!-- 性别 -->
          <div>
            <label class="text-sm text-gray-500 mb-1 block">性别</label>
            <div class="flex gap-2">
              <button v-for="opt in [{ v: 'male', l: '男' }, { v: 'female', l: '女' }]" :key="opt.v" @click="editForm.gender = opt.v"
                :class="['flex-1 py-2 rounded-lg text-sm border transition-colors', editForm.gender === opt.v ? 'border-[#0B5FD7] bg-[#0B5FD7]/10 text-[#0B5FD7] font-medium' : 'border-gray-200 text-gray-600']">{{ opt.l }}</button>
            </div>
          </div>
          <!-- 年龄（与入营问卷 Step1 一致） -->
          <div>
            <label class="text-sm text-gray-500 mb-1 block">年龄 <span class="text-red-500">*</span></label>
            <input v-model="editForm.age" type="number" inputmode="numeric" placeholder="请输入年龄"
              class="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:border-[#0B5FD7] focus:ring-1 focus:ring-[#0B5FD7]/20 outline-none" />
          </div>
          <!-- 身高 -->
          <div>
            <label class="text-sm text-gray-500 mb-1 block">身高 (cm)</label>
            <input v-model="editForm.height" type="number" inputmode="decimal" placeholder="请输入身高"
              class="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:border-[#0B5FD7] focus:ring-1 focus:ring-[#0B5FD7]/20 outline-none" />
          </div>
          <!-- 体重 -->
          <div>
            <label class="text-sm text-gray-500 mb-1 block">体重 (kg)</label>
            <input v-model="editForm.weight" type="number" inputmode="decimal" placeholder="请输入体重"
              class="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:border-[#0B5FD7] focus:ring-1 focus:ring-[#0B5FD7]/20 outline-none" />
          </div>
          <!-- 疾病史 -->
          <div>
            <label class="text-sm text-gray-500 mb-1 block">疾病史 / 慢性疾病</label>
            <div class="flex gap-2 mb-2">
              <button v-for="opt in ['无', '有']" :key="opt" @click="editForm.hasChronic = opt"
                :class="['flex-1 py-2 rounded-lg text-sm border transition-colors', editForm.hasChronic === opt ? 'border-[#0B5FD7] bg-[#0B5FD7]/10 text-[#0B5FD7] font-medium' : 'border-gray-200 text-gray-600']">{{ opt }}</button>
            </div>
            <input v-if="editForm.hasChronic === '有'" v-model="editForm.chronicDetails" type="text" placeholder="请描述疾病详情"
              class="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:border-[#0B5FD7] focus:ring-1 focus:ring-[#0B5FD7]/20 outline-none" />
          </div>
          <!-- 特殊饮食 -->
          <div>
            <label class="text-sm text-gray-500 mb-1 block">特殊饮食</label>
            <div class="flex gap-2 mb-2">
              <button v-for="opt in ['无', '有']" :key="opt" @click="editForm.hasSpecialDiet = opt"
                :class="['flex-1 py-2 rounded-lg text-sm border transition-colors', editForm.hasSpecialDiet === opt ? 'border-[#0B5FD7] bg-[#0B5FD7]/10 text-[#0B5FD7] font-medium' : 'border-gray-200 text-gray-600']">{{ opt }}</button>
            </div>
            <input v-if="editForm.hasSpecialDiet === '有'" v-model="editForm.specialDietDetails" type="text" placeholder="请描述特殊饮食要求"
              class="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:border-[#0B5FD7] focus:ring-1 focus:ring-[#0B5FD7]/20 outline-none" />
          </div>
          <!-- 过敏史 -->
          <div>
            <label class="text-sm text-gray-500 mb-1 block">过敏史 / 食物过敏</label>
            <div class="flex gap-2 mb-2">
              <button v-for="opt in ['无', '有']" :key="opt" @click="editForm.hasFoodAllergy = opt"
                :class="['flex-1 py-2 rounded-lg text-sm border transition-colors', editForm.hasFoodAllergy === opt ? 'border-[#0B5FD7] bg-[#0B5FD7]/10 text-[#0B5FD7] font-medium' : 'border-gray-200 text-gray-600']">{{ opt }}</button>
            </div>
            <input v-if="editForm.hasFoodAllergy === '有'" v-model="editForm.foodAllergyDetails" type="text" placeholder="请描述过敏源"
              class="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:border-[#0B5FD7] focus:ring-1 focus:ring-[#0B5FD7]/20 outline-none" />
          </div>
        </div>
        <p v-if="editError" class="text-red-500 text-sm text-center mt-3">{{ editError }}</p>
        <div class="flex gap-3 mt-6">
          <button @click="showEditBasic = false" class="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm">取消</button>
          <button @click="saveBasic" class="flex-1 py-2.5 rounded-lg bg-[#0B5FD7] text-white text-sm font-medium">保存</button>
        </div>
      </div>
    </VanPopup>

    <!-- 编辑生活与运动习惯弹窗 -->
    <VanPopup v-model:show="showEditLifestyle" position="bottom" round closeable close-icon-position="top-right" class="custom-popup" :style="{ maxHeight: '85vh' }">
      <div class="p-5 pb-8 overflow-y-auto">
        <h3 class="font-bold text-gray-900 mb-4 text-center">编辑生活与运动习惯</h3>
        <div class="space-y-4">
          <!-- 作息时间 -->
          <div class="grid grid-cols-3 gap-2">
            <div>
              <label class="text-sm text-gray-500 mb-1 block">就寝</label>
              <button type="button" @click="openTimePicker('sleepTime')"
                class="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:border-[#0B5FD7] outline-none flex items-center justify-between">
                <span :class="editForm.sleepTime ? 'text-gray-900' : 'text-gray-400'">{{ editForm.sleepTime || '选择时间' }}</span>
                <ChevronRight class="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>
            <div>
              <label class="text-sm text-gray-500 mb-1 block">起床</label>
              <button type="button" @click="openTimePicker('wakeTime')"
                class="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:border-[#0B5FD7] outline-none flex items-center justify-between">
                <span :class="editForm.wakeTime ? 'text-gray-900' : 'text-gray-400'">{{ editForm.wakeTime || '选择时间' }}</span>
                <ChevronRight class="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>
            <div>
              <label class="text-sm text-gray-500 mb-1 block">时长(h)</label>
              <input v-model="editForm.sleepDuration" type="number" inputmode="decimal" placeholder="如 8"
                class="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:border-[#0B5FD7] outline-none" />
            </div>
          </div>
          <!-- 饮酒 -->
          <div>
            <label class="text-sm text-gray-500 mb-1 block">饮酒</label>
            <div class="flex gap-2">
              <button v-for="opt in ['从不', '偶尔', '经常']" :key="opt" @click="editForm.drinkAlcohol = opt"
                :class="['flex-1 py-2 rounded-lg text-sm border transition-colors', editForm.drinkAlcohol === opt ? 'border-[#0B5FD7] bg-[#0B5FD7]/10 text-[#0B5FD7] font-medium' : 'border-gray-200 text-gray-600']">{{ opt }}</button>
            </div>
          </div>
          <!-- 吸烟 -->
          <div>
            <label class="text-sm text-gray-500 mb-1 block">吸烟</label>
            <div class="flex gap-2">
              <button v-for="opt in ['从不', '偶尔', '经常', '已戒']" :key="opt" @click="editForm.smoke = opt"
                :class="['flex-1 py-2 rounded-lg text-sm border transition-colors', editForm.smoke === opt ? 'border-[#0B5FD7] bg-[#0B5FD7]/10 text-[#0B5FD7] font-medium' : 'border-gray-200 text-gray-600']">{{ opt }}</button>
            </div>
          </div>
          <!-- 零食 -->
          <div>
            <label class="text-sm text-gray-500 mb-1 block">经常吃零食</label>
            <div class="flex gap-2">
              <button v-for="opt in ['否', '是']" :key="opt" @click="editForm.snack = opt"
                :class="['flex-1 py-2 rounded-lg text-sm border transition-colors', editForm.snack === opt ? 'border-[#0B5FD7] bg-[#0B5FD7]/10 text-[#0B5FD7] font-medium' : 'border-gray-200 text-gray-600']">{{ opt }}</button>
            </div>
          </div>
          <!-- 日饮水量 -->
          <div>
            <label class="text-sm text-gray-500 mb-1 block">日饮水量 (ml)</label>
            <input v-model="editForm.dailyWater" type="number" inputmode="numeric" placeholder="如 2000"
              class="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:border-[#0B5FD7] outline-none" />
          </div>
          <!-- 运动频率和时长 -->
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-sm text-gray-500 mb-1 block">每周运动次数</label>
              <input v-model="editForm.exerciseFrequency" type="number" inputmode="numeric" placeholder="如 3"
                class="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:border-[#0B5FD7] outline-none" />
            </div>
            <div>
              <label class="text-sm text-gray-500 mb-1 block">每次时长(分钟)</label>
              <input v-model="editForm.exerciseDuration" type="number" inputmode="numeric" placeholder="如 30"
                class="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:border-[#0B5FD7] outline-none" />
            </div>
          </div>
          <!-- 运动类型 -->
          <div>
            <label class="text-sm text-gray-500 mb-1 block">运动类型 (逗号分隔)</label>
            <input v-model="editForm.exerciseTypesStr" type="text" placeholder="如 跑步, 游泳, 瑜伽"
              class="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:border-[#0B5FD7] outline-none" />
          </div>
        </div>
        <p v-if="editError" class="text-red-500 text-sm text-center mt-3">{{ editError }}</p>
        <div class="flex gap-3 mt-6">
          <button @click="showEditLifestyle = false" class="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm">取消</button>
          <button @click="saveLifestyle" class="flex-1 py-2.5 rounded-lg bg-[#0B5FD7] text-white text-sm font-medium">保存</button>
        </div>
      </div>
    </VanPopup>

    <NavBar title="健康档案" :on-back="store.goBack">
      <template #right>
        <div class="flex items-center gap-1">
          <button class="text-[#0B5FD7] hover:bg-blue-50 p-2 rounded-full transition-colors" @click="handleUploadReport">
            <UploadCloud class="h-5 w-5" />
          </button>
        </div>
      </template>
    </NavBar>

    <div class="p-4 space-y-4">
      <Card v-if="!qData && !store.questionnaireAnswered" class="text-center py-10 text-gray-500 text-sm">
        尚未完成自查问卷
      </Card>
      <template v-else>
        <Card>
          <h3 class="font-bold text-gray-900 mb-4 flex items-center gap-2 border-b pb-2">
            <ClipboardList class="h-4 w-4 text-[#0B5FD7]" />
            基础与健康信息
            <button @click="openEditBasic" class="ml-auto text-[#0B5FD7] hover:bg-blue-50 p-1.5 rounded-full transition-colors">
              <Pencil class="h-3.5 w-3.5" />
            </button>
          </h3>
          <div class="space-y-3 text-sm">
            <div class="flex justify-between border-b border-gray-50 pb-2"><span class="text-gray-500">性别</span><span class="text-gray-900">{{ store.user?.gender === 'female' ? '女' : '男' }}</span></div>
            <div class="flex justify-between border-b border-gray-50 pb-2"><span class="text-gray-500">年龄</span><span class="text-gray-900">{{ qData?.age || store.user?.age || '--' }}</span></div>
            <div class="flex justify-between border-b border-gray-50 pb-2"><span class="text-gray-500">身高</span><span class="text-gray-900">{{ qData?.height || '--' }} cm</span></div>
            <div class="flex justify-between border-b border-gray-50 pb-2"><span class="text-gray-500">体重</span><span class="text-gray-900">{{ qData?.weight || '--' }} kg</span></div>
            <div class="flex justify-between border-b border-gray-50 pb-2"><span class="text-gray-500">疾病史/慢性疾病</span><span class="text-gray-900">{{ qData?.hasChronic === '有' ? qData.chronicDetails : '无' }}</span></div>
            <div class="flex justify-between border-b border-gray-50 pb-2"><span class="text-gray-500">特殊饮食</span><span class="text-gray-900">{{ qData?.hasSpecialDiet === '有' ? qData.specialDietDetails : '无' }}</span></div>
            <div class="flex justify-between"><span class="text-gray-500">过敏史/食物过敏</span><span class="text-gray-900">{{ qData?.hasFoodAllergy === '有' ? qData.foodAllergyDetails : '无' }}</span></div>
          </div>
        </Card>

        <Card class="space-y-3 border border-blue-100 bg-gradient-to-br from-blue-50/70 to-white">
          <div class="flex items-center justify-between border-b border-blue-100/60 pb-2">
            <h3 class="flex items-center gap-2 text-sm font-bold text-gray-900">
              <Stethoscope class="h-4 w-4 text-[#0B5FD7]" /> 团队结论与处方
            </h3>
            <button v-if="store.hasPermission('action.chat')" class="flex items-center gap-1 text-[10px] font-bold text-[#0B5FD7]" @click="store.openChatForStudent(store.user!.id, store.selectedCampId || store.getStudentCampId(store.user!.id))">
              <MessageCircle class="h-3 w-3" /> 随访
            </button>
          </div>

          <div v-if="latestDoctorFollowup" class="rounded-xl bg-white/85 p-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-[11px] font-bold text-gray-900">
                <ShieldCheck class="h-3.5 w-3.5 text-[#0B5FD7]" />
                {{ latestDoctorFollowup.type }}
              </div>
              <span class="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-bold text-amber-600">{{ latestDoctorFollowup.riskLevel }}危</span>
            </div>
            <p class="mt-1.5 text-[10px] leading-relaxed text-gray-600">{{ latestDoctorFollowup.note }}</p>
            <p v-if="latestDoctorFollowup.medicationReview" class="mt-1 text-[10px] leading-relaxed text-gray-500">
              <span class="font-bold text-gray-700">用药复核：</span>{{ latestDoctorFollowup.medicationReview }}
            </p>
            <div class="mt-1.5 flex flex-wrap gap-x-3 text-[9px] text-gray-400">
              <span>{{ latestDoctorFollowup.doctorName }} 医师</span>
              <span v-if="latestDoctorFollowup.nextFollowupDate">下次随访 {{ latestDoctorFollowup.nextFollowupDate }}</span>
              <span v-if="latestDoctorFollowup.referral">转诊建议：{{ latestDoctorFollowup.referral }}</span>
            </div>
          </div>
          <div v-else class="rounded-xl bg-white/85 p-3 text-[10px] text-gray-500">医师风险评估与干预方案尚未归档。</div>

          <button class="flex w-full items-center gap-3 rounded-xl bg-white/85 p-3 text-left active:bg-white" @click="store.setCurrentView('nutrition-prescription')">
            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><Leaf class="h-4 w-4" /></div>
            <div class="min-w-0 flex-1">
              <div class="text-[11px] font-bold text-gray-900">营养评估与饮食处方</div>
              <div class="mt-0.5 truncate text-[9px] text-gray-500">
                {{ nutritionPrescription ? `${nutritionPrescription.saltTarget} · ${nutritionPrescription.proteinTarget}` : '待营养师评估发布' }}
              </div>
            </div>
            <ChevronRight class="h-4 w-4 text-gray-300" />
          </button>

          <div class="flex items-start gap-2 border-t border-blue-100/60 pt-2 text-[9px] leading-relaxed text-gray-500">
            <ShieldCheck class="mt-0.5 h-3 w-3 shrink-0 text-[#0B5FD7]" />
            <span v-if="consentRecord">
              已签署 {{ consentRecord.protocolVersion }} · {{ consentRecord.signedAt.slice(0, 16) }} · 留痕 {{ consentRecord.traceId }}
            </span>
            <span v-else>尚未签署健康数据授权协议；正式入营前需完成。</span>
          </div>
        </Card>

        <Card>
          <h3 class="font-bold text-gray-900 mb-4 flex items-center gap-2 border-b pb-2">
            <Activity class="h-4 w-4 text-[#0B5FD7]" />
            生活与运动习惯
            <button @click="openEditLifestyle" class="ml-auto text-[#0B5FD7] hover:bg-blue-50 p-1.5 rounded-full transition-colors">
              <Pencil class="h-3.5 w-3.5" />
            </button>
          </h3>
          <div class="space-y-3 text-sm">
            <div class="flex justify-between border-b border-gray-50 pb-2"><span class="text-gray-500">作息时间</span><span class="text-gray-900">{{ qData?.sleepTime || '--' }} - {{ qData?.wakeTime || '--' }} ({{ qData?.sleepDuration || '--' }}h)</span></div>
            <div class="flex justify-between border-b border-gray-50 pb-2"><span class="text-gray-500">饮酒/吸烟</span><span class="text-gray-900">{{ qData?.drinkAlcohol || '--' }} / {{ qData?.smoke || '--' }}</span></div>
            <div class="flex justify-between border-b border-gray-50 pb-2"><span class="text-gray-500">经常吃零食</span><span class="text-gray-900">{{ qData?.snack || '--' }}</span></div>
            <div class="flex justify-between border-b border-gray-50 pb-2"><span class="text-gray-500">日饮水量</span><span class="text-gray-900">{{ qData?.dailyWater || '--' }} ml</span></div>
            <div class="flex justify-between border-b border-gray-50 pb-2"><span class="text-gray-500">每周运动</span><span class="text-gray-900">{{ qData?.exerciseFrequency || '--' }}次 (每次{{ qData?.exerciseDuration || '--' }}分钟)</span></div>
            <div class="flex justify-between"><span class="text-gray-500">运动类型</span><span class="text-gray-900 text-right">{{ (qData?.exerciseTypes || []).join(', ') || '--' }}</span></div>
          </div>
        </Card>
      </template>

      <Card class="bg-orange-50 border-orange-100">
        <p class="text-xs text-orange-800">
          提示：心血管指标按“开营 / 第 6 个月 / 结营”三次节点记录。橙色表示超出参考范围，空值表示未检测或待复查；不以体重下降作为唯一有效标准。
        </p>
      </Card>

      <Card class="border border-[#0B5FD7]/15 bg-gradient-to-br from-[#F5F9FF] to-white p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-2">
            <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0B5FD7]/10 text-[#0B5FD7]">
              <HeartPulse class="h-4 w-4" />
            </div>
            <div>
              <h3 class="text-sm font-bold text-gray-900">家庭血压自测</h3>
              <p class="mt-0.5 text-[9px] text-gray-400">晨起、睡前各测一次；静坐 5 分钟后记录</p>
            </div>
          </div>
          <button class="flex shrink-0 items-center gap-1 rounded-full bg-[#0B5FD7] px-3 py-1.5 text-[10px] font-bold text-white active:scale-95" @click="openBpForm">
            <Plus class="h-3 w-3" /> 记录
          </button>
        </div>

        <div class="mt-3 grid grid-cols-3 gap-2 text-center">
          <div class="rounded-xl bg-white p-2.5 ring-1 ring-blue-100">
            <div class="text-[9px] text-gray-400">最近血压</div>
            <div class="mt-1 text-lg font-black leading-none" :class="latestBp && (latestBp.sbp >= 180 || latestBp.dbp >= 110) ? 'text-red-600' : 'text-[#0B5FD7]'">
              {{ latestBp ? `${latestBp.sbp}/${latestBp.dbp}` : '--' }}
            </div>
            <div class="mt-1 text-[8px] text-gray-400">mmHg</div>
          </div>
          <div class="rounded-xl bg-white p-2.5 ring-1 ring-blue-100">
            <div class="text-[9px] text-gray-400">静息心率</div>
            <div class="mt-1 text-lg font-black leading-none text-gray-900">{{ latestBp?.pulse ?? '--' }}</div>
            <div class="mt-1 text-[8px] text-gray-400">次/分</div>
          </div>
          <div class="rounded-xl bg-white p-2.5 ring-1 ring-blue-100">
            <div class="text-[9px] text-gray-400">近 7 日记录</div>
            <div class="mt-1 text-lg font-black leading-none text-gray-900">{{ bpRecordDays }}<span class="text-[10px] font-normal text-gray-400">/7 天</span></div>
            <div class="mt-1 h-1 overflow-hidden rounded-full bg-gray-100">
              <div class="h-full rounded-full bg-[#0B5FD7]" :style="{ width: `${bpWeekProgress * 100}%` }"></div>
            </div>
          </div>
        </div>

        <div class="mt-3 space-y-1.5">
          <div v-for="r in bpRecords.slice(0, 3)" :key="r.id" class="flex items-center justify-between rounded-lg bg-white/80 px-2.5 py-2 text-[10px] ring-1 ring-gray-100">
            <span class="text-gray-400">{{ r.date.slice(5, 16) }}</span>
            <span class="font-bold" :class="r.sbp >= 180 || r.dbp >= 110 ? 'text-red-600' : 'text-gray-800'">{{ r.sbp }}/{{ r.dbp }} mmHg</span>
            <span class="max-w-[45%] truncate text-gray-400">{{ r.note || '家庭自测' }}</span>
          </div>
          <div v-if="bpRecords.length === 0" class="rounded-lg bg-blue-50/70 px-3 py-2 text-[10px] text-gray-500">
            还没有家庭血压记录。建议连续 7 天晨起、睡前测量，团队会结合趋势调整随访。
          </div>
        </div>
        <p class="mt-2 text-[9px] leading-relaxed text-gray-400">
          如血压持续 ≥180/110，或伴随胸痛、气短、视物模糊、晕厥，请立即停止活动并联系团队或拨打 120。家庭记录不能替代到院诊断。
        </p>
      </Card>

      <Card class="border border-blue-100 bg-gradient-to-br from-blue-50/80 to-white p-4">
        <h3 class="flex items-center gap-2 text-sm font-bold text-gray-900">
          <Stethoscope class="h-4 w-4 text-[#0B5FD7]" />
          心脑血管管理重点
        </h3>
        <div class="mt-3 grid grid-cols-3 gap-2 text-center">
          <div class="rounded-xl bg-white/80 px-2 py-2">
            <div class="text-[9px] text-gray-400">血压目标</div>
            <div class="mt-1 text-[11px] font-bold text-[#0B5FD7]">&lt;130/80</div>
            <div class="mt-0.5 text-[8px] text-gray-400">耐受情况下</div>
          </div>
          <div class="rounded-xl bg-white/80 px-2 py-2">
            <div class="text-[9px] text-gray-400">LDL-C</div>
            <div class="mt-1 text-[11px] font-bold text-[#0B5FD7]">个体化</div>
            <div class="mt-0.5 text-[8px] text-gray-400">按危险分层</div>
          </div>
          <div class="rounded-xl bg-white/80 px-2 py-2">
            <div class="text-[9px] text-gray-400">静息心率</div>
            <div class="mt-1 text-[11px] font-bold text-[#0B5FD7]">55–80</div>
            <div class="mt-0.5 text-[8px] text-gray-400">次/分参考</div>
          </div>
        </div>
        <div class="mt-3 space-y-1.5 text-[10px] leading-relaxed text-gray-500">
          <p><span class="font-bold text-gray-700">当前心血管指标：</span>{{ cardioMetricItems.length }} 项，包含血压、静息心率和同型半胱氨酸。</p>
          <p><span class="font-bold text-gray-700">长期用药：</span>{{ medicationText }}</p>
          <p>服用他汀期间避免大量西柚汁；服用华法林时绿叶菜摄入保持稳定；调整药物请先联系医师，不要自行停药。</p>
          <p class="text-[#0B5FD7]">以上为一般管理目标，最终目标由医师根据冠心病、斑块、糖尿病等危险分层个体化确定。</p>
        </div>
      </Card>

      <Card v-for="(cat, idx) in medicalData" :key="idx" class="p-0 overflow-hidden shadow-sm border border-gray-100">
        <div @click="toggleCat(cat.title)" class="bg-gray-50 px-4 py-3 border-b border-gray-100 flex items-center gap-2 cursor-pointer hover:bg-gray-100/80 transition-colors select-none">
          <Stethoscope class="w-4 h-4 text-[#1677FF]" />
          <h3 class="font-bold text-gray-900 text-sm">{{ cat.title }}</h3>
          <span class="text-[10px] text-gray-400">{{ cat.items.length }} 项</span>
          <ChevronDown :class="['ml-auto w-4 h-4 text-gray-400 transition-transform duration-300', collapsedCats.has(cat.title) ? '-rotate-90' : '']" />
        </div>
        <div v-show="!collapsedCats.has(cat.title)" class="divide-y divide-gray-50">
          <div v-for="(item, iIdx) in cat.items" :key="iIdx" class="p-4">
            <div class="flex justify-between items-center mb-3">
              <div class="font-bold text-gray-900 text-sm">{{ item.name }}</div>
              <div class="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded font-medium tracking-wide">
                参考: {{ item.normalRange }} {{ item.unit }}
              </div>
            </div>

            <div class="grid grid-cols-3 gap-2">
              <div class="bg-gray-50 p-2 rounded-lg flex flex-col justify-center items-center">
                <span class="text-[9px] text-gray-500 mb-1 font-medium">开营</span>
                <div class="text-sm">
                  <template v-if="item.beforeValue === null"><span class="text-gray-400">-- 待上传</span></template>
                  <template v-else-if="item.beforeValue === undefined || item.beforeValue === ''"><span class="text-gray-400">-- 未检测</span></template>
                  <span v-else :class="item.isBeforeOut ? 'text-orange-500 font-bold' : 'text-gray-900 font-medium'">{{ item.beforeValue }}</span>
                  <span v-if="item.beforeValue !== null && item.beforeValue !== undefined && item.beforeValue !== '' && item.unit" class="text-[10px] text-gray-500 ml-1">{{ item.unit }}</span>
                </div>
              </div>
              <div class="bg-amber-50 p-2 rounded-lg flex flex-col justify-center items-center border border-amber-100">
                <span class="text-[9px] text-amber-600 font-bold mb-1">第 6 个月</span>
                <div class="text-sm">
                  <template v-if="item.midtermValue === null || item.midtermValue === undefined"><span class="text-gray-400">-- 待复查</span></template>
                  <span v-else :class="item.isMidtermOut ? 'text-orange-500 font-bold' : 'text-gray-900 font-medium'">{{ item.midtermValue }}</span>
                  <span v-if="item.midtermValue !== null && item.midtermValue !== undefined && item.unit" class="text-[10px] text-gray-500 ml-1">{{ item.unit }}</span>
                </div>
              </div>
              <div class="bg-[#0B5FD7]/5 p-2 rounded-lg flex flex-col justify-center items-center border border-[#0B5FD7]/10">
                <span class="text-[9px] text-[#0B5FD7] font-bold mb-1">结营</span>
                <div class="text-sm">
                  <template v-if="item.afterValue === null"><span class="text-gray-400">-- 待更新</span></template>
                  <template v-else-if="item.afterValue === undefined || item.afterValue === ''"><span class="text-gray-400">-- 未检测</span></template>
                  <span v-else :class="item.isAfterOut ? 'text-orange-500 font-bold' : 'text-gray-900 font-medium'">{{ item.afterValue }}</span>
                  <span v-if="item.afterValue !== null && item.afterValue !== undefined && item.afterValue !== '' && item.unit" class="text-[10px] text-gray-500 ml-1">{{ item.unit }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card v-if="qData?.medicalReports && qData.medicalReports.length > 0">
        <h3 class="font-bold text-gray-900 mb-4 flex items-center gap-2 border-b pb-2">
          <FileText class="h-4 w-4 text-[#0B5FD7]" />
          个人医疗报告
        </h3>
        <div class="grid grid-cols-2 gap-3">
          <div
            v-for="(r, idx) in qData.medicalReports"
            :key="idx"
            class="relative rounded-lg overflow-hidden border border-gray-100 shadow-sm aspect-[3/4] cursor-pointer hover:opacity-90 transition-opacity"
            @click="openReport(r)"
          >
            <div v-if="r.type === 'pdf'" class="w-full min-h-full flex flex-col items-center justify-center bg-gray-50 text-[#0B5FD7]">
              <FileText class="w-8 h-8 mb-1" />
              <span class="text-[10px] text-gray-500 truncate px-1">{{ r.name || 'PDF报告' }}</span>
            </div>
            <img loading="lazy" decoding="async" v-else :src="r.url" :alt="`报告 ${idx + 1}`" class="w-full min-h-full object-cover" />
            <div class="absolute bottom-0 left-0 right-0 bg-black/50 backdrop-blur-sm text-white text-[10px] p-1.5 text-center truncate">
              {{ reportCategoryLabel(r.category) }} · {{ r.type === 'pdf' ? (r.name || `报告 ${idx + 1}`) : `报告 ${idx + 1}` }}
            </div>
          </div>
        </div>
      </Card>
    </div>

    <VanPopup v-model:show="showBpForm" position="bottom" round>
      <div class="p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <div class="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200"></div>
        <div class="flex items-center justify-between">
          <h3 class="text-base font-bold text-gray-900">记录家庭血压</h3>
          <button class="rounded-full bg-gray-100 p-2 text-gray-500" @click="showBpForm = false"><X class="h-4 w-4" /></button>
        </div>
        <p class="mt-1 text-[10px] text-gray-400">测量前静坐 5 分钟，袖带与心脏同高；不建议运动后立即测量。</p>
        <div class="mt-4 grid grid-cols-2 gap-3">
          <label class="rounded-xl bg-gray-50 p-3">
            <span class="text-[10px] font-bold text-gray-500">收缩压（高压）</span>
            <input v-model="bpForm.sbp" type="number" inputmode="numeric" placeholder="如 132" class="mt-1 w-full bg-transparent text-lg font-black text-gray-900 outline-none placeholder:text-gray-300" />
            <span class="text-[9px] text-gray-400">mmHg</span>
          </label>
          <label class="rounded-xl bg-gray-50 p-3">
            <span class="text-[10px] font-bold text-gray-500">舒张压（低压）</span>
            <input v-model="bpForm.dbp" type="number" inputmode="numeric" placeholder="如 82" class="mt-1 w-full bg-transparent text-lg font-black text-gray-900 outline-none placeholder:text-gray-300" />
            <span class="text-[9px] text-gray-400">mmHg</span>
          </label>
        </div>
        <div class="mt-3 grid grid-cols-2 gap-3">
          <label class="rounded-xl bg-gray-50 p-3">
            <span class="text-[10px] font-bold text-gray-500">静息心率（选填）</span>
            <input v-model="bpForm.pulse" type="number" inputmode="numeric" placeholder="如 72" class="mt-1 w-full bg-transparent text-lg font-black text-gray-900 outline-none placeholder:text-gray-300" />
            <span class="text-[9px] text-gray-400">次/分</span>
          </label>
          <label class="rounded-xl bg-gray-50 p-3">
            <span class="text-[10px] font-bold text-gray-500">测量情境</span>
            <input v-model="bpForm.note" placeholder="晨起 / 睡前 / 服药后" class="mt-1 w-full bg-transparent text-xs font-semibold text-gray-900 outline-none placeholder:text-gray-300" />
            <span class="text-[9px] text-gray-400">便于医师判断趋势</span>
          </label>
        </div>
        <p v-if="bpFormError" class="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-600">{{ bpFormError }}</p>
        <div class="mt-4 flex gap-2">
          <button class="flex-1 rounded-xl bg-gray-100 py-3 text-sm font-bold text-gray-500" @click="showBpForm = false">取消</button>
          <button class="flex-[2] rounded-xl bg-[#0B5FD7] py-3 text-sm font-bold text-white active:scale-[0.99]" @click="saveBp">保存记录</button>
        </div>
        <p class="mt-3 text-[9px] leading-relaxed text-gray-400">如血压 ≥180/110，请静坐后复测并立即联系医师；出现胸痛、气短、晕厥请拨打 120。</p>
      </div>
    </VanPopup>

    <!-- 时间选择器弹窗 -->
    <VanPopup v-model:show="showTimePicker" position="bottom" round>
      <VanTimePicker
        v-model="timePickerValue"
        :title="timePickerField === 'sleepTime' ? '选择就寝时间' : '选择起床时间'"
        :columns-type="['hour', 'minute']"
        @confirm="onTimePickerConfirm"
        @cancel="showTimePicker = false"
      />
    </VanPopup>

    <!-- Bottom Nav：首页 / 活动(显隐随营期) / 消息 / 档案；高亮由 anchor 推导 -->
    <StudentTabbar anchor="health-profile" :badge="unreadCount > 0 ? unreadCount : undefined" />
  </div>
</template>
