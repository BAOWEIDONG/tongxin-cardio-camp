<script setup lang="ts">
import { computed, ref } from 'vue';
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
  Phone,
  Search,
  ShieldCheck,
  Stethoscope,
  Users,
  UserCircle,
} from 'lucide-vue-next';
import { useAppStore } from '../store/app';

const store = useAppStore();
const tab = ref<'workbench' | 'patients' | 'followups' | 'profile'>('workbench');
const keyword = ref('');
const followupNote = ref('');
const activeFollowup = ref<string | null>(null);

type Patient = {
  id: string;
  name: string;
  age: number;
  risk: '高' | '中' | '低';
  bp: string;
  ldl: string;
  condition: string;
  next: string;
};

const patients: Patient[] = [
  { id: 'p1', name: '王秀兰', age: 62, risk: '高', bp: '168/96', ldl: '3.8', condition: '高血压 2 级 · 颈动脉斑块', next: '今日 16:00' },
  { id: 'p2', name: '陈建国', age: 55, risk: '中', bp: '136/84', ldl: '2.9', condition: '高血压 · LDL-C 偏高', next: '今日 10:30' },
  { id: 'p3', name: '孙国平', age: 58, risk: '高', bp: '142/90', ldl: '3.2', condition: '频发室早 · 冠脉狭窄', next: '明日 09:20' },
  { id: 'p4', name: '刘建华', age: 49, risk: '中', bp: '128/82', ldl: '3.4', condition: '高脂血症 · 超重', next: '11月22日' },
  { id: 'p5', name: '赵淑芬', age: 66, risk: '低', bp: '122/76', ldl: '2.1', condition: '高血压稳定期', next: '11月25日' },
  { id: 'p6', name: '周志强', age: 51, risk: '中', bp: '134/86', ldl: '3.0', condition: '代谢综合征', next: '11月23日' },
];

const filteredPatients = computed(() => {
  const q = keyword.value.trim();
  if (!q) return patients;
  return patients.filter((p) => p.name.includes(q) || p.condition.includes(q));
});

const followups = ref([
  { id: 'f1', name: '陈建国', date: '11-20 10:30', type: '第 2 周处方复核', text: '家庭血压 136/84，快走 35 分钟无胸闷。维持当前运动强度，继续记录晨起血压。' },
  { id: 'f2', name: '王秀兰', date: '11-19 16:00', type: '血压预警随访', text: '连续 3 天晨起血压 ≥160/95，已建议到院复核并携带家庭血压记录。' },
  { id: 'f3', name: '孙国平', date: '11-18 15:20', type: '动态心电复核', text: '动态心电提示频发室早、短阵室速，已转诊心内科进一步评估。' },
]);

const showPrescription = ref(false);
const prescriptionSigned = ref(false);
const doctorCampNames = computed(() => {
  const account = store.accounts.find((a) => a.id === store.user?.id);
  const names = (account?.campIds || [])
    .map((id) => store.camps.find((c) => c.id === id)?.name)
    .filter(Boolean);
  return names.length > 0 ? names.join('、') : '全部营期';
});

function signPrescription() {
  prescriptionSigned.value = true;
  showPrescription.value = false;
  showToast({ message: '运动处方已签署，同步至康复师与学员', position: 'top' });
}

function riskClass(risk: Patient['risk']) {
  if (risk === '高') return 'bg-red-50 text-red-600';
  if (risk === '中') return 'bg-amber-50 text-amber-600';
  return 'bg-blue-50 text-blue-600';
}

function startFollowup(id: string) {
  activeFollowup.value = id;
  followupNote.value = '';
}

function saveFollowup() {
  if (!followupNote.value.trim()) {
    showToast('请填写随访结论');
    return;
  }
  const target = followups.value.find((f) => f.id === activeFollowup.value);
  const now = new Date();
  const date = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  followups.value.unshift({
    id: `f_${Date.now()}`,
    name: target?.name || '患者',
    date,
    type: '线上随访记录',
    text: followupNote.value.trim(),
  });
  showToast({ message: '随访记录已保存并留痕', position: 'top' });
  activeFollowup.value = null;
  followupNote.value = '';
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
          <p class="mt-1 text-xs font-semibold text-[#0B5FD7]">北大国际医院 · 心血管内科</p>
          <p class="mt-1 text-[11px] text-gray-400">今天有 3 位患者需要重点跟进</p>
        </div>
      </div>
    </div>

    <div class="flex-1 space-y-4 px-5">
      <div class="rounded-2xl border border-red-100 bg-red-50/80 p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-sm font-bold text-red-700">
            <AlertTriangle class="h-4 w-4" /> 2 条风险预警
          </div>
          <span class="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-red-500">待处理</span>
        </div>
        <p class="mt-2 text-[11px] leading-relaxed text-red-700/80">王秀兰家庭血压连续 3 天 ≥160/95；孙国平动态心电出现短阵室速，已转诊。</p>
        <button class="mt-3 flex items-center gap-1 text-[11px] font-semibold text-red-700" @click="tab = 'patients'">
          查看预警患者 <ChevronRight class="h-3 w-3" />
        </button>
      </div>

      <div class="grid grid-cols-4 gap-2">
        <div class="rounded-xl bg-white p-2.5 text-center shadow-sm">
          <p class="text-[10px] text-gray-400">今日患者</p>
          <p class="mt-1 text-xl font-bold text-gray-900">8</p>
        </div>
        <div class="rounded-xl bg-white p-2.5 text-center shadow-sm">
          <p class="text-[10px] text-gray-400">待签署</p>
          <p class="mt-1 text-xl font-bold text-amber-500">{{ prescriptionSigned ? 1 : 2 }}</p>
        </div>
        <div class="rounded-xl bg-white p-2.5 text-center shadow-sm">
          <p class="text-[10px] text-gray-400">高风险</p>
          <p class="mt-1 text-xl font-bold text-red-500">2</p>
        </div>
        <div class="rounded-xl bg-white p-2.5 text-center shadow-sm">
          <p class="text-[10px] text-gray-400">待随访</p>
          <p class="mt-1 text-xl font-bold text-[#0B5FD7]">4</p>
        </div>
      </div>

      <template v-if="tab === 'workbench'">
        <div class="rounded-2xl bg-white p-4 shadow-sm">
          <div class="mb-3 flex items-center justify-between">
            <p class="text-sm font-bold text-gray-900">需要处理</p>
            <span class="text-[10px] text-gray-400">按风险排序</span>
          </div>
          <button class="flex w-full items-center gap-3 rounded-xl bg-red-50/60 p-3 text-left" @click="tab = 'patients'">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-600">王</div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <p class="text-sm font-semibold text-gray-900">王秀兰 · 62 岁</p>
                <span class="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold text-red-600">高危</span>
              </div>
              <p class="mt-1 text-[11px] text-gray-500">家庭血压 168/96 · 连续 3 天高于阈值</p>
            </div>
            <ChevronRight class="h-4 w-4 text-gray-300" />
          </button>
          <button class="mt-2 flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left ring-1 ring-gray-100" @click="showPrescription = true">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-600"><FileSignature class="h-5 w-5" /></div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-gray-900">陈建国 · 第 2 周运动处方</p>
              <p class="mt-1 text-[11px] text-gray-500">{{ prescriptionSigned ? '医师已签署，已同步至康复师与学员' : '李康复师已提交，中低强度有氧，等待医师签署' }}</p>
            </div>
            <span v-if="prescriptionSigned" class="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-semibold text-[#0B5FD7]">已签署</span>
            <span v-else class="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-semibold text-amber-600">待签署</span>
          </button>
          <button class="mt-2 flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left ring-1 ring-gray-100" @click="tab = 'patients'">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-[#0B5FD7]"><HeartPulse class="h-5 w-5" /></div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-gray-900">孙国平 · 动态心电复核</p>
              <p class="mt-1 text-[11px] text-gray-500">频发室早、短阵室速 · 已转诊</p>
            </div>
            <span class="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-semibold text-[#0B5FD7]">复核</span>
          </button>
        </div>

        <div class="rounded-2xl bg-white p-4 shadow-sm">
          <div class="mb-3 flex items-center gap-2">
            <CalendarClock class="h-4 w-4 text-[#0B5FD7]" />
            <p class="text-sm font-bold text-gray-900">今日日程</p>
          </div>
          <div class="space-y-3 border-l-2 border-blue-100 pl-4">
            <div>
              <p class="text-xs font-semibold text-gray-900">10:30 团队随访 · 陈建国</p>
              <p class="mt-1 text-[11px] text-gray-400">第 2 周处方复核</p>
            </div>
            <div>
              <p class="text-xs font-semibold text-gray-900">14:00 门诊 · 王秀兰</p>
              <p class="mt-1 text-[11px] text-gray-400">血压预警到院复核</p>
            </div>
            <div>
              <p class="text-xs font-semibold text-gray-900">16:30 多学科讨论 · 孙国平</p>
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
          <button v-for="p in filteredPatients" :key="p.id" class="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm">
            <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-[#0B5FD7]">{{ p.name.slice(0, 1) }}</div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <p class="text-sm font-semibold text-gray-900">{{ p.name }} · {{ p.age }} 岁</p>
                <span class="rounded-full px-1.5 py-0.5 text-[9px] font-semibold" :class="riskClass(p.risk)">{{ p.risk }}危</span>
              </div>
              <p class="mt-1 truncate text-[11px] text-gray-500">{{ p.condition }}</p>
              <p class="mt-1 text-[10px] text-gray-400">血压 {{ p.bp }} mmHg · LDL-C {{ p.ldl }} mmol/L</p>
            </div>
            <div class="text-right">
              <p class="text-[9px] text-gray-400">下次随访</p>
              <p class="mt-1 text-[10px] font-semibold text-[#0B5FD7]">{{ p.next }}</p>
            </div>
          </button>
        </div>
      </template>

      <template v-else-if="tab === 'followups'">
        <div v-for="f in followups" :key="f.id" class="rounded-2xl bg-white p-4 shadow-sm">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-semibold text-gray-900">{{ f.name }} · {{ f.type }}</p>
              <p class="mt-1 text-[10px] text-gray-400">{{ f.date }} · 已留痕</p>
            </div>
            <CheckCircle2 class="h-4 w-4 text-[#0B5FD7]" />
          </div>
          <p class="mt-2 text-[11px] leading-relaxed text-gray-500">{{ f.text }}</p>
          <button class="mt-3 text-[11px] font-semibold text-[#0B5FD7]" @click="startFollowup(f.id)">继续记录本次随访</button>
          <div v-if="activeFollowup === f.id" class="mt-3 rounded-xl bg-blue-50/60 p-3">
            <textarea v-model="followupNote" rows="3" class="w-full resize-none rounded-lg border border-blue-100 bg-white p-2 text-xs outline-none focus:border-[#0B5FD7]" placeholder="填写随访结论、用药调整与下次复诊时间" />
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
            <p class="flex items-center gap-2"><Phone class="h-3.5 w-3.5 text-[#0B5FD7]" /> 服务患者 86 人 · 在营 62 人</p>
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
        <div class="flex items-start justify-between">
          <div>
            <h3 class="text-lg font-bold text-gray-900">运动处方签署</h3>
            <p class="mt-1 text-xs text-gray-400">陈建国 · 55 岁 · 高血压 · LDL-C 偏高</p>
          </div>
          <span class="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-600">待医师签署</span>
        </div>

        <div class="mt-4 space-y-3">
          <div class="rounded-xl bg-[#F7F9FC] p-3">
            <p class="text-[10px] text-gray-400">处方内容</p>
            <p class="mt-1 text-sm font-bold text-gray-900">快走 + 低强度有氧</p>
            <p class="mt-1 text-[11px] leading-relaxed text-gray-500">每周 5 次，每次 30–40 分钟；心率控制在（220−年龄）×50%–60%，运动中可正常交谈。</p>
          </div>
          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="rounded-xl bg-blue-50/60 py-2">
              <p class="text-[9px] text-gray-400">频次</p>
              <p class="mt-1 text-sm font-bold text-gray-900">5 次/周</p>
            </div>
            <div class="rounded-xl bg-blue-50/60 py-2">
              <p class="text-[9px] text-gray-400">时长</p>
              <p class="mt-1 text-sm font-bold text-gray-900">30–40 分</p>
            </div>
            <div class="rounded-xl bg-blue-50/60 py-2">
              <p class="text-[9px] text-gray-400">强度</p>
              <p class="mt-1 text-sm font-bold text-gray-900">中低</p>
            </div>
          </div>
          <div class="rounded-xl border border-amber-100 bg-amber-50/70 p-3">
            <p class="text-[10px] font-bold text-amber-700">运动风险提示</p>
            <p class="mt-1 text-[11px] leading-relaxed text-amber-700/80">出现胸痛、胸闷、明显心悸或头晕时立即停止；血压 ≥160/100 时暂缓运动并联系团队。</p>
          </div>
          <label class="flex items-center gap-2 text-[11px] text-gray-500">
            <input type="checkbox" checked class="accent-[#0B5FD7]" />
            已核对患者病历、运动评估与用药情况
          </label>
        </div>

        <div class="mt-5 flex gap-3">
          <button class="flex-1 rounded-xl bg-gray-100 py-3 text-sm font-bold text-gray-500" @click="showPrescription = false">取消</button>
          <button class="flex-[2] rounded-xl bg-[#0B5FD7] py-3 text-sm font-bold text-white active:scale-[0.99]" @click="signPrescription">签署通过</button>
        </div>
      </div>
    </VanPopup>

    <VanTabbar v-model="tab" class="custom-tabbar">
      <VanTabbarItem name="workbench">
        <template #icon><LayoutDashboard class="h-6 w-6" /></template>
        工作台
      </VanTabbarItem>
      <VanTabbarItem name="patients">
        <template #icon><Users class="h-6 w-6" /></template>
        患者
      </VanTabbarItem>
      <VanTabbarItem name="followups">
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
