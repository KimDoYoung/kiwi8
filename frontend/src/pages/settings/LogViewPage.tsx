import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  Terminal, 
  RefreshCcw, 
  Filter, 
  FileText, 
  Download,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';

interface LogResponse {
  file_name: string;
  total_lines: number;
  filtered_count: number;
  returned_count: number;
  logs: string[];
}

interface LogFile {
  name: string;
  size: number;
  modified: number;
}

const LogViewPage: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [logFiles, setLogFiles] = useState<LogFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 필터 상태
  const [lines, setLines] = useState(100);
  const [level, setLevel] = useState<string>('');
  const [fileIndex, setFileIndex] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogFiles = async () => {
    try {
      const response = await axios.get('/kiwi8/api/v1/common/logs/files');
      setLogFiles(response.data);
    } catch (err) {
      console.error('Failed to fetch log files', err);
    }
  };

  const fetchLogs = async () => {
    if (loading) return; // 이미 로딩 중이면 중복 호출 방지
    setLoading(true);
    setError(null);
    try {
      const params = {
        lines,
        level: level || undefined,
        file_index: fileIndex
      };
      // 10초 타임아웃 설정
      const response = await axios.get<LogResponse>('/kiwi8/api/v1/common/logs', { 
        params,
        timeout: 10000 
      });
      
      if (response.data && response.data.logs) {
        setLogs(response.data.logs);
        // 로그가 로드되면 맨 아래로 스크롤
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        }, 100);
      }
    } catch (err: unknown) {
      console.error('Log fetch error:', err);
      setError(axios.isAxiosError(err) && err.code === 'ECONNABORTED' ? '응답 시간이 초과되었습니다.' : (axios.isAxiosError(err) ? (err.response?.data?.detail || '로그를 가져오는데 실패했습니다.') : '로그를 가져오는데 실패했습니다.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogFiles();
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileIndex, level]); // 파일이나 레벨 변경 시 자동 로드

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (autoRefresh && !loading) {
      interval = setInterval(fetchLogs, 5000); // 5초마다 갱신
    }
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, loading, lines, level, fileIndex]);

  const handleDownload = () => {
    window.location.href = `/kiwi8/api/v1/common/logs/download?file_index=${fileIndex}`;
  };

  const getLevelColor = (line: string) => {
    if (line.includes('- ERROR -')) return 'text-red-600 font-semibold';
    if (line.includes('- WARNING -')) return 'text-amber-600';
    if (line.includes('- INFO -')) return 'text-blue-600';
    if (line.includes('- DEBUG -')) return 'text-slate-500 italic';
    return 'text-slate-800';
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] space-y-4 p-4 bg-slate-50/50">
      {/* 상단 컨트롤 바 */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
            {/* 파일 선택 섹션 */}
            <div className="flex items-center gap-2">
            <FileText size={18} className="text-blue-500" />
            <select 
                className="bg-white text-slate-900 border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none hover:border-slate-400 transition-colors"
                value={fileIndex}
                onChange={(e) => setFileIndex(Number(e.target.value))}
            >
                <option value={0}>현재 로그 (kiwi8.log)</option>
                {logFiles.filter(f => f.name.includes('.log.')).map((f, i) => (
                <option key={f.name} value={i + 1}>{f.name}</option>
                ))}
            </select>
            </div>

            {/* 필터 섹션 */}
            <div className="flex items-center gap-2">
            <Filter size={18} className="text-emerald-500" />
            <select 
                className="bg-white text-slate-900 border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none hover:border-slate-400 transition-colors"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
            >
                <option value="">모든 레벨</option>
                <option value="INFO" className="text-blue-600">INFO</option>
                <option value="DEBUG" className="text-slate-600">DEBUG</option>
                <option value="WARNING" className="text-amber-600">WARNING</option>
                <option value="ERROR" className="text-red-600">ERROR</option>
            </select>
            </div>

            {/* 줄 수 입력 섹션 */}
            <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600">줄 수:</span>
            <input 
                type="number" 
                className="w-20 bg-white text-slate-900 border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                value={lines}
                onChange={(e) => setLines(Number(e.target.value))}
                min={1}
                max={1000}
            />
            </div>
        </div>

        <div className="flex items-center gap-4">           
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer hover:text-slate-900 transition-colors">
                <input 
                type="checkbox" 
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 bg-white text-blue-600 focus:ring-blue-500"
                />
                자동 갱신 (5초)
            </label>

            <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
                {/* 새로고침 버튼 */}
                <Button
                    onClick={fetchLogs}
                    disabled={loading}
                    variant="default"
                >
                    <RefreshCcw size={16} className={loading ? "animate-spin" : ""} />
                    새로고침
                </Button>

                {/* 다운로드 버튼 */}
                <Button
                    onClick={handleDownload}
                    variant="outline"
                    title="현재 선택된 로그 파일 전체 다운로드"
                >
                <Download size={16} />
                다운로드
                </Button>
            </div>
        </div>
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-red-600 rounded-md text-sm font-medium">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {/* 로그 터미널 영역 */}
      <div 
        ref={scrollRef}
        className="flex-1 bg-white rounded-lg border border-slate-200 overflow-auto shadow-sm p-4 font-mono text-sm"
      >
        {logs.length > 0 ? (
          <div className="space-y-0.5">
            {logs.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all border-l-2 border-transparent hover:border-slate-100 pl-2">
                <span className="text-slate-400 mr-2 shrink-0 inline-block w-8 text-right select-none">{i + 1}</span>
                <span className={getLevelColor(line)}>{line}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2">
            <Terminal size={48} opacity={0.2} />
            <p>{loading ? '로그를 불러오는 중...' : '표시할 로그가 없습니다.'}</p>
          </div>
        )}
      </div>

      {/* 하단 요약 정보 */}
      <div className="flex items-center justify-between text-xs text-slate-500 px-2">
        <div>
          {fileIndex === 0 ? 'kiwi8.log' : `kiwi8.log.${fileIndex}`} - 총 {logs.length}개 줄 표시 중
        </div>
        <div className="flex items-center gap-4">
          <span>최종 갱신: {new Date().toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
};

export default LogViewPage;
