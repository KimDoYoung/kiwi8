import { Button } from '@/shared/components/ui/button'

import { 
  Sparkles, 
  Zap, 
  TrendingUp, 
  Settings, 
  FileText, 
  MousePointer2 
} from "lucide-react";

const DashboardPage = () => {
  return (
    <div className="min-h-screen bg-slate-950 p-10 flex flex-col items-center justify-center space-y-12">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold text-white tracking-tight">Beautiful Button Collection</h1>
        <p className="text-slate-400">shadcn/ui 기반의 커스텀 스타일 프리셋</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl">
        
        {/* 1. Glassmorphism */}
        <div className="flex flex-col items-center gap-4 p-6 bg-slate-900/50 rounded-2xl border border-slate-800">
          <span className="text-xs font-mono text-slate-500 uppercase">Glassmorphism</span>
          <Button className="bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/20 text-white shadow-xl transition-all h-12 px-6">
            <Sparkles className="mr-2 h-4 w-4 text-blue-400" />
            AI 인사이트 생성
          </Button>
        </div>

        {/* 2. Gradient Glow */}
        <div className="flex flex-col items-center gap-4 p-6 bg-slate-900/50 rounded-2xl border border-slate-800">
          <span className="text-xs font-mono text-slate-500 uppercase">Gradient Glow</span>
          <Button className="relative bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:shadow-[0_0_25px_rgba(37,99,235,0.6)] transition-all duration-300 border-none h-12 px-6">
            <Zap className="mr-2 h-4 w-4 fill-current" />
            강력 조건 검색
          </Button>
        </div>

        {/* 3. Cyberpunk Border */}
        <div className="flex flex-col items-center gap-4 p-6 bg-slate-900/50 rounded-2xl border border-slate-800">
          <span className="text-xs font-mono text-slate-500 uppercase">Cyberpunk Border</span>
          <Button variant="outline" className="border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-colors font-bold uppercase tracking-wider text-xs h-12 px-6">
            <TrendingUp className="mr-2 h-4 w-4" />
            상승 테마 분석
          </Button>
        </div>

        {/* 4. Minimalist Floating */}
        <div className="flex flex-col items-center gap-4 p-6 bg-slate-900/50 rounded-2xl border border-slate-800">
          <span className="text-xs font-mono text-slate-500 uppercase">Minimalist Floating</span>
          <Button className="bg-slate-900 text-slate-300 border border-slate-800 shadow-[4px_4px_10px_black] hover:translate-y-[-2px] active:translate-y-[0px] hover:text-white transition-all h-12 px-6 group">
            <Settings className="mr-2 h-4 w-4 group-hover:rotate-90 transition-transform duration-300" />
            환경 설정
          </Button>
        </div>

        {/* 5. Soft Neumorphic Dark */}
        <div className="flex flex-col items-center gap-4 p-6 bg-slate-900/50 rounded-2xl border border-slate-800">
          <span className="text-xs font-mono text-slate-500 uppercase">Neumorphic Dark</span>
          <Button className="bg-[#1a1f2e] text-slate-400 border-t border-white/5 border-l border-white/5 shadow-[5px_5px_15px_rgba(0,0,0,0.5),-2px_-2px_10px_rgba(255,255,255,0.02)] hover:text-blue-400 transition-all h-12 px-6">
            <FileText className="mr-2 h-4 w-4" />
            보고서 내보내기
          </Button>
        </div>

        {/* Interactive Tip */}
        <div className="flex flex-col items-center justify-center gap-2 p-6 bg-blue-600/5 rounded-2xl border border-blue-500/20">
          <MousePointer2 className="h-6 w-6 text-blue-500 animate-bounce" />
          <p className="text-[11px] text-blue-400 font-medium text-center italic">
            마우스를 올려서<br/>애니메이션을 확인하세요
          </p>
        </div>

      </div>
    </div>
  );
};

export default DashboardPage;