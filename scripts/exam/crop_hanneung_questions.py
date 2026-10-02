"""한능검 문제 PDF(글자 없는 이미지 PDF)를 문항별 PNG로 자른다.

사용: python scripts/exam/crop_hanneung_questions.py <문제 PDF> <시험지 id>
  예) python scripts/exam/crop_hanneung_questions.py "C:/.../reference/hanneung/2026-79/79-advanced-questions.pdf" 2026-hanneung-79-advanced

- 페이지를 3배(216dpi)로 렌더링하고 머리말·쪽번호를 뺀 뒤 좌우 두 단으로 나눈다.
- 문항 머리줄 오른쪽 끝의 "[N점]"("점]" 모양 템플릿 매칭)을 문항 시작으로 잡는다. 페이지당 찾은 문항 수가
  데이터 JSON의 pageEnds(페이지별 마지막 문항 번호)와 다르면 멈춘다. 읽는 순서는 왼쪽 단 → 오른쪽 단.
- 잘린 문항은 글자 둘레만 남기고 여백을 정리해 public/exams/<id>/q-NN.jpg 로 저장한다.
- 결과는 반드시 contact sheet로 눈으로 확인한다(--sheet).
"""
import json
import sys
from pathlib import Path

import fitz  # PyMuPDF
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
ZOOM = 3
INK = 200          # 이보다 어두우면 글자/그림
PAD = 24           # 저장할 때 둘레 여백(px, 3배 기준)


def render(page):
    pix = page.get_pixmap(matrix=fitz.Matrix(ZOOM, ZOOM), alpha=False)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    return img[:, :, :3].copy()


def trim(img):
    gray = img.mean(axis=2)
    mask = gray < INK
    # 단 경계·쪽번호 근처의 점 한두 개는 무시한다(그대로 두면 아래에 큰 빈칸이 남는다).
    ys = np.where(mask.sum(axis=1) > 2)[0]
    xs = np.where(mask.sum(axis=0) > 2)[0]
    if len(ys) == 0 or len(xs) == 0:
        return img
    y0, y1 = max(0, ys.min() - PAD), min(img.shape[0], ys.max() + 1 + PAD)
    x0, x1 = max(0, xs.min() - PAD), min(img.shape[1], xs.max() + 1 + PAD)
    return img[y0:y1, x0:x1]


def page_columns(img, first_page):
    """머리말(첫 쪽은 제목까지)·쪽번호를 빼고 좌우 두 단으로 나눈다."""
    h, w, _ = img.shape
    top = int(h * (0.145 if first_page else 0.062))
    if first_page:
        # Locate the long rule beneath the cover title, ignoring short text
        # strokes and pictures further down the question area.
        band = img[int(h * 0.08):int(h * 0.20), int(w * 0.055):int(w * 0.94)]
        rules = np.flatnonzero((band.mean(axis=2) < INK).mean(axis=1) > 0.75)
        if len(rules):
            first_rule = np.split(rules, np.flatnonzero(np.diff(rules) > 1) + 1)[0]
            top = int(h * 0.08) + int(first_rule[-1]) + 10
    bottom = int(h * 0.945)
    mid = w // 2
    return [img[top:bottom, int(w * 0.035):mid - 6], img[top:bottom, mid + 6:int(w * 0.975)]]


RIGHT = 0.85  # 단 오른쪽 15% — 문항 머리줄의 "[N점]"이 있는 자리


def canonical_marker_template():
    """Reviewed 79th-round 점] raster; independent of cover/question wording."""
    pix = fitz.Pixmap(str(Path(__file__).with_name('hanneung-marker.png')))
    return np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width).astype(float)


def marker_template(col):
    """첫 쪽 왼쪽 단 첫 문항의 "[N점]"에서 공통 부분 "점]"을 떼어 템플릿으로 쓴다."""
    gray = col.mean(axis=2)
    region = gray[:, int(gray.shape[1] * RIGHT):]
    rows = (region < INK).any(axis=1)
    if not rows.any():
        raise ValueError('cannot find a question marker template on the first page')
    y = int(np.argmax(rows))
    end = y
    while end < len(rows) and rows[end]:
        end += 1
    band = region[y:end]
    xs = np.where((band < INK).any(axis=0))[0]
    width = int((xs.max() + 1 - xs.min()) * 0.5)
    return band[:, xs.max() + 1 - width:xs.max() + 1].astype(float)


def find_markers(col, tpl, threshold=0.8):
    """단 안에서 "점]"과 모양이 맞는 머리줄의 y(단 기준)를 위에서부터."""
    gray = col.mean(axis=2)
    region = gray[:, int(gray.shape[1] * RIGHT):].astype(float)
    th, tw = tpl.shape
    t = tpl - tpl.mean()
    tn = np.sqrt((t * t).sum())
    try:
        import cv2
    except ImportError:
        from numpy.lib.stride_tricks import sliding_window_view
        win = sliding_window_view(region, (th, tw))
        wz = win - win.mean(axis=(2, 3))[..., None, None]
        cc = (wz * t).sum(axis=(2, 3)) / (np.sqrt((wz * wz).sum(axis=(2, 3))) * tn + 1e-6)
    else:
        # Same normalized correlation; optional acceleration avoids the large
        # temporary sliding-window array when checking many rounds.
        cc = cv2.matchTemplate(region.astype(np.float32), tpl.astype(np.float32), cv2.TM_CCOEFF_NORMED)
    ys, xs = np.where(cc > threshold)
    taken = []
    for score, y in sorted(zip(cc[ys, xs], ys), reverse=True):
        if all(abs(y - other) > 60 for other, _ in taken):
            taken.append((int(y), float(score)))
    return sorted(taken)


def block_top(gray_rows, y, max_gap=50):
    """머리줄이 두 줄일 수 있으니(줄 사이 ~35px), 위로 50px 이하 틈은 같은 문항으로 본다. 문항 사이 여백은 90px 이상."""
    top = y
    k = y - 1
    blank = 0
    while k >= 0:
        if gray_rows[k]:
            top, blank = k, 0
        else:
            blank += 1
            if blank > max_gap:
                break
        k -= 1
    return top


def split_page(img, first_page, count, tpl, *, detailed=False):
    pieces, scores = [], []
    for col in page_columns(img, first_page):
        rows = (col.mean(axis=2) < INK).sum(axis=1) > 2
        markers = find_markers(col, tpl)
        starts = [block_top(rows, y) for y, _ in markers]
        if markers:
            # The number sits further left than circled choices. Its ink band
            # anchors a heading without recognizing/comparing numeral glyphs.
            # This also handles a points label on the following line: looking
            # only at all-column blank gaps can walk into the previous answer.
            y = markers[0][0]
            header = col[max(0, y - 100):y + tpl.shape[0]].mean(axis=2) < INK
            xs = np.flatnonzero(header.any(axis=0))
            left = int(xs[0])
            number_rows = (col[:, left:left + 20].mean(axis=2) < INK).sum(axis=1) > 2
            for index, (y, _) in enumerate(markers):
                candidates = np.flatnonzero(number_rows[max(0, y - 100):y + tpl.shape[0]]) + max(0, y - 100)
                if len(candidates):
                    groups = np.split(candidates, np.flatnonzero(np.diff(candidates) > 10) + 1)
                    anchor = min(groups, key=lambda group: min(abs(group - y)))[0]
                    if starts[index] < anchor - 10:
                        nearby = np.flatnonzero(rows[max(0, anchor - 8):anchor + 1])
                        starts[index] = max(0, anchor - 8) + int(nearby[0]) if len(nearby) else int(anchor)
        scores += [s for _, s in markers]
        for a, b in zip(starts, starts[1:] + [len(rows)]):
            # 시작 줄(점 3개 이상) 위의 글자 꼭대기·위 여백까지 포함한다. 문항 사이 여백(90px+)보다 작게.
            pieces.append(trim(col[max(0, a - PAD):b]))
    if count is not None and len(pieces) != count:
        raise SystemExit(f'expected {count} questions on this page, found {len(pieces)}')
    if not scores:
        raise ValueError('no question markers found on this page')
    return pieces, scores if detailed else min(scores)


def main():
    pdf, paper_id = sys.argv[1], sys.argv[2]
    data_path = ROOT / 'src' / 'features' / 'exam' / 'data' / f'{paper_id}.json'
    data = json.loads(data_path.read_text(encoding='utf-8'))
    ends = data['pageEnds']
    doc = fitz.open(pdf)
    assert doc.page_count == len(ends), (doc.page_count, len(ends))
    out = ROOT / 'public' / 'exams' / paper_id
    out.mkdir(parents=True, exist_ok=True)
    number = 0
    report = []
    tpl = canonical_marker_template()
    for index, page in enumerate(doc):
        count = ends[index] - (ends[index - 1] if index else 0)
        pieces, worst = split_page(render(page), index == 0, count, tpl)
        report.append((index + 1, count, worst))
        for piece in pieces:
            number += 1
            # 사진이 많아 PNG는 장당 0.5MB 안팎 — 아이패드에서 빨리 뜨도록 JPEG(품질 85)로 저장한다.
            piece = np.ascontiguousarray(piece)
            fitz.Pixmap(fitz.csRGB, piece.shape[1], piece.shape[0], piece.tobytes(), False).save(str(out / f'q-{number:02d}.jpg'), jpg_quality=85)
    assert number == ends[-1]
    for page_no, count, worst in report:
        print(f'page {page_no}: {count} questions, lowest marker match {worst:.2f}')
    for q in data['questions']:
        q['imageUrl'] = f'/exams/{paper_id}/q-{q["number"]:02d}.jpg'
    data['questionImages'] = 'cropped'
    data_path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print('wrote', number, 'questions to', out)


if __name__ == '__main__':
    main()
