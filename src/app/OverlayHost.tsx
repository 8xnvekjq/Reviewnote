import type { MistakeEntry, ReviewState } from '../types';
import type { NoticeModalState } from '../components/CustomNoticeModal';
import type { UnseenScaffoldingItem } from '../components/NewScaffoldingModal';
import type { CropPercent } from '../utils/guideBoxCrop';
import { MistakeDetailModal } from '../components/MistakeDetailModal';
import { ImageCropper } from '../components/ImageCropper';
import { SlideListModal } from '../components/SlideListModal';
import { StoreGuideModal } from '../components/StoreGuideModal';
import { NewScaffoldingModal } from '../components/NewScaffoldingModal';
import { CustomNoticeModal } from '../components/CustomNoticeModal';
import { FloatingPointsContainer } from '../components/FloatingPointsContainer';
import { LaTeXRenderer } from '../components/LaTeXRenderer';

interface OverlayHostProps {
  // 오답 상세 모달 — selectedEntry 등 데이터는 여기서 소유하지 않는다. App.tsx(추후 mistakes
  // feature)가 계속 소유하고, 이 컴포넌트는 "그 값이 있으면 무엇을 렌더할지"만 결정한다.
  selectedEntry: MistakeEntry | null;
  mistakes: MistakeEntry[];
  peerActivities: any[];
  analyzingEntryId: string | null;
  averageWaitMs: number | null;
  youtubeLectures: any[];
  isReviewSession: boolean;
  checkpointRegenStatus: Record<string, 'generating' | 'success' | 'failed'>;
  equippedStamp?: string;
  profilesStampMap: Record<string, string>;
  currentUserId: string;
  isAdmin: boolean;
  aiPersonaName: string;
  comboBoosterExpiresAt: string | null;
  onCloseDetailModal: () => void;
  onDeleteMistake: (id: string, e: React.MouseEvent) => void;
  onStartAnalysis: (entry: MistakeEntry) => void;
  onUpdateReviews: (id: string, newReviews: ReviewState[], skipPointRecalc?: boolean) => void;
  onUpdateCheckpointStatus: (
    id: string,
    stageIndex: number,
    checkpointIndex: number,
    newStatus: 'understood' | 'stuck'
  ) => void;
  onRetryCheckpointGeneration: (entry: MistakeEntry) => void;
  onSelectEntry: (entry: MistakeEntry | null) => void;
  onUpdateDetailEntry: (updated: MistakeEntry) => void;

  // 이미지 크롭 오버레이
  tempCapturedImage: string | null;
  tempInitialCrop?: CropPercent;
  onCropComplete: (blob: Blob) => void;
  onCancelCrop: () => void;

  // 수업자료 모달
  isSlideListOpen: boolean;
  onCloseSlideList: () => void;

  // 인쇄 전용 레이아웃
  printItems: MistakeEntry[] | null;
  printAsTextMap: Record<string, boolean>;

  // 럭키상점 가이드 모달
  isStoreGuideOpen: boolean;
  onCloseStoreGuide: () => void;
  onGoToStore: () => void;

  // 신규 스캐폴딩 힌트 안내 모달
  isNewScaffoldingModalOpen: boolean;
  unseenScaffoldings: UnseenScaffoldingItem[];
  onCloseNewScaffoldingModal: () => void;
  onGoToScaffoldingClinic: () => void;

  // 전역 커스텀 알림 모달
  noticeModal: NoticeModalState;
  onCloseNotice: () => void;

  // 플로팅 포인트 애니메이션
  aiVoice?: string;

  // 업로드 진행 오버레이
  isUploadingPhoto: boolean;
}

// App.tsx에 흩어져 있던 modal/overlay 렌더링·게이팅을 한 곳으로 모은 컴포넌트. 오직 "무엇을
// 렌더할지"만 담당하며, selectedEntry를 비롯한 어떤 상태도 여기서 소유하지 않는다 — 전부 부모가
// 소유한 값을 props로 받아 그대로 전달할 뿐이다. 각 오버레이의 open/close 조건·순서·내부 동작은
// 기존과 완전히 동일하다.
export function OverlayHost({
  selectedEntry,
  mistakes,
  peerActivities,
  analyzingEntryId,
  averageWaitMs,
  youtubeLectures,
  isReviewSession,
  checkpointRegenStatus,
  equippedStamp,
  profilesStampMap,
  currentUserId,
  isAdmin,
  aiPersonaName,
  comboBoosterExpiresAt,
  onCloseDetailModal,
  onDeleteMistake,
  onStartAnalysis,
  onUpdateReviews,
  onUpdateCheckpointStatus,
  onRetryCheckpointGeneration,
  onSelectEntry,
  onUpdateDetailEntry,
  tempCapturedImage,
  tempInitialCrop,
  onCropComplete,
  onCancelCrop,
  isSlideListOpen,
  onCloseSlideList,
  printItems,
  printAsTextMap,
  isStoreGuideOpen,
  onCloseStoreGuide,
  onGoToStore,
  isNewScaffoldingModalOpen,
  unseenScaffoldings,
  onCloseNewScaffoldingModal,
  onGoToScaffoldingClinic,
  noticeModal,
  onCloseNotice,
  aiVoice,
  isUploadingPhoto,
}: OverlayHostProps) {
  return (
    <>
      {/* Selected Entry Detail Modal */}
      {selectedEntry && (
        <MistakeDetailModal
          selectedEntry={selectedEntry}
          allEntries={mistakes}
          peerActivities={peerActivities}
          isAnalyzing={analyzingEntryId === selectedEntry.id}
          averageWaitMs={averageWaitMs}
          youtubeLectures={youtubeLectures}
          onClose={onCloseDetailModal}
          onDeleteMistake={onDeleteMistake}
          onStartAnalysis={onStartAnalysis}
          onUpdateReviews={onUpdateReviews}
          onUpdateCheckpointStatus={onUpdateCheckpointStatus}
          checkpointRegenStatus={checkpointRegenStatus[selectedEntry.id]}
          onRetryCheckpointGeneration={() => onRetryCheckpointGeneration(selectedEntry)}
          onSelectEntry={onSelectEntry}
          isReviewSession={isReviewSession}
          onUpdateEntry={onUpdateDetailEntry}
          equippedStamp={equippedStamp}
          profilesStampMap={profilesStampMap}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          aiPersonaName={aiPersonaName}
          comboBoosterExpiresAt={comboBoosterExpiresAt}
        />
      )}

      {/* Interactive Image Cropper Bounding Box overlay */}
      {tempCapturedImage && (
        <ImageCropper
          imageSrc={tempCapturedImage}
          initialCrop={tempInitialCrop}
          onCropComplete={onCropComplete}
          onCancel={onCancelCrop}
        />
      )}

      {/* 수업자료 모달 다이얼로그 */}
      <SlideListModal
        isOpen={isSlideListOpen}
        onClose={onCloseSlideList}
      />

      {/* 인쇄 전용 2열 세로 구분선 레이아웃 (@media print 시에만 노출) */}
      {printItems && printItems.length > 0 && (
        <div className="print-only-layout hidden">
          {/* 정갈한 학습지 타이틀 */}
          <div className="border-b-2 border-slate-850 pb-2.5 mb-6 flex justify-between items-end">
            <div>
              <h1 className="text-base font-extrabold text-slate-900 tracking-tight">더쿠키수학 오답노트</h1>
              <p className="text-[8px] text-slate-500 font-mono mt-0.5">완료된 문제 모아찍기 학습지</p>
            </div>
            <div className="text-right text-[8px] text-slate-500 font-mono">
              <span>인쇄일: {new Date().toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\s/g, '')}</span>
            </div>
          </div>

          <div className="print-column-wrapper">
            {printItems.map((entry) => {
              const cleanTitle = (entry.title || '').replace(/\$[^$]+\$/g, '').replace(/[#*`_]/g, '').slice(0, 16);
              const formattedDate = entry.date
                ? new Date(entry.date).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\s/g, '')
                : '—';

              const isTextPrint = printAsTextMap[entry.id];
              const hasProblemText = !!entry.analysis?.problemText;

              return (
                <div key={entry.id} className="print-card-item">
                  {/* 단정한 헤더 이력 바 */}
                  <div className="flex justify-between items-center text-[7px] text-slate-500 border-b border-slate-200 pb-1 mb-1.5 font-mono">
                    <span className="font-bold text-slate-800">[{entry.grade || '공통'} ➔ {entry.chapter || '기타'}] {cleanTitle}...</span>
                    <span>등록: {formattedDate}</span>
                  </div>
                  {/* 문제 영역 (텍스트 또는 이미지) */}
                  {isTextPrint && hasProblemText ? (
                    <div className="text-[10px] text-slate-900 leading-relaxed font-sans select-text whitespace-pre-line py-1 border border-slate-100 rounded px-2 bg-slate-50/30">
                      <LaTeXRenderer text={entry.analysis!.problemText || ''} className="text-[10px] text-slate-900 leading-relaxed" isPrintMode={true} />
                    </div>
                  ) : (
                    <img src={entry.imageUrl} alt={entry.title} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 🎁 럭키상점 활용 가이드 모달 팝업 창 */}
      <StoreGuideModal
        isOpen={isStoreGuideOpen}
        onClose={onCloseStoreGuide}
        onGoToStore={onGoToStore}
      />

      {/* 💡 선생님의 신규 스캐폴딩 힌트 안내 모달 팝업 창 */}
      <NewScaffoldingModal
        isOpen={isNewScaffoldingModalOpen}
        unseenItems={unseenScaffoldings}
        onClose={onCloseNewScaffoldingModal}
        onSelectMistake={onSelectEntry}
        onGoToClinic={onGoToScaffoldingClinic}
      />

      {/* 🔔 전역 커스텀 알림 모달 (웹 브라우저 native alert 완전 대체) */}
      <CustomNoticeModal
        notice={noticeModal}
        onClose={onCloseNotice}
      />

      {/* ⚡ 클릭/터치 위치 플로팅 획득 포인트 애니메이션 */}
      <FloatingPointsContainer aiVoice={aiVoice} />

      {/* 📤 크롭 확정 직후~업로드 완료 전까지 처리 중임을 표시 (Storage 업로드 + DB 저장 대기 구간) */}
      {isUploadingPhoto && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center space-y-3 bg-black/70 backdrop-blur-sm">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-bold text-slate-200">문제를 저장하고 있어요...</p>
        </div>
      )}
    </>
  );
}
