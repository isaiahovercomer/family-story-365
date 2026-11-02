"""依既有逐句朗讀時間製作字幕、影片交接表與本篇下載包；不生成影片或圖片。"""
import json
import math
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent


def stamp(seconds):
    ms = round(seconds * 1000)
    return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d}.{ms % 1000:03d}'


def vtt(cues):
    return 'WEBVTT\n\n' + '\n\n'.join(
        f'{i+1}\n{stamp(c["start"])} --> {stamp(c["end"])}\n{c["text"]}'
        for i, c in enumerate(cues)) + '\n'


def main():
    story = json.loads((ROOT / 'story.json').read_text())
    manifest = json.loads((ROOT / 'narration-assets.json').read_text())
    descriptions = json.loads((ROOT / 'scene-descriptions.json').read_text())
    offset = 0
    timeline = []
    rows = []
    for page in manifest['pages']:
        (ROOT / f'{page["id"]}.zh-TW.vtt').write_text(vtt(page['cues']))
        if page['mode'] != 'theatre':
            continue
        index = int(page['id'][-2:]) - 1
        # 沿用首篇製作流程：原 WAV 長度 + 0.5 秒，再向上取整至 24 fps。
        # MP3 編碼會有極短的延遲；組裝以 manifest 原始取樣長度為準。
        duration = math.ceil((page['seconds'] + 0.5) * 24) / 24
        timeline.extend(dict(c, start=c['start'] + offset, end=c['end'] + offset) for c in page['cues'])
        scene = story['versions']['theatre']['pages'][index]
        rows.append(f'| {index+1}・{scene["title"]} | {stamp(offset)}–{stamp(offset+duration)}（{duration:.3f} 秒） | {descriptions[scene["scene"]]} | `{page["file"]}`／`{page["id"]}.zh-TW.vtt` |')
        offset += duration
    (ROOT / 'narrated.zh-TW.vtt').write_text(vtt(timeline))
    spec = f'''# 積木小橋再試一次：影片製作交接規格

狀態：待製作。此次沒有生成影片或 AI 圖片；網站僅提供程式排版文字封面與六張 SVG 文字佔位。

## 故事與觀眾

給台灣 0–12 歲家庭的原創日常故事。主題是面對挫折：先停一下、說出需要，再一起找辦法。主要影片採 4–6 歲故事劇場六頁版本；其他版本可按下方逐頁清單另製。

## 輸出規格與風格

- 1280×720、16:9、24 fps、H.264／yuv420p MP4，音軌 AAC、48 kHz、雙聲道，使用 faststart。
- 正式檔名 `narrated-preview.mp4`；繁體中文字幕 `narrated.zh-TW.vtt`，封面 `video-poster.png`。
- 水彩繪本風格、溫暖客廳、地墊與窗外小雨。固定三位家人：哥哥芥黃色上衣、弟弟藍色上衣、媽媽綠色上衣；角色外觀、服裝與積木配色跨鏡一致。無品牌、字幕以外不生成文字。
- 積木與小車在地墊上操作；不拋擲積木、不責罵、不以表情誇張羞辱孩子。媽媽坐到同一高度陪伴，不要求立刻平靜。
- 每鏡以慢速推近或平移呈現，允許少量角色動作；保留積木倒下、呼吸、合作搭橋、小車通過等重點。轉場採硬切；如加淡化不得縮短時間軸或讓旁白重疊。
- 畫面重要內容保留邊緣 5% 安全區，下方預留字幕位置。字幕採繁體中文與公開字型；建議每行不超過18個全形字，換行時保留原句文字與時間。
- 使用已完成本篇的合成朗讀，不克隆真人聲音，不加入歌曲、歌詞或未授權音樂。

## 劇場分鏡與時間軸

總長 **{offset:.3f} 秒**。下列時間自 00:00:00.000 累加，每頁為原始 WAV 取樣時長加 0.5 秒、向上取整至 24 fps；用對應 MP3 解碼後精準 trim／apad 到該長度。MP3 本身含編碼延遲，不能直接拿容器 duration 累加。

| 頁／場景 | 起訖／長度 | 畫面描述 | 旁白／逐頁字幕 |
| --- | --- | --- | --- |
''' + '\n'.join(rows) + '''

`narrated.zh-TW.vtt` 已按上述累積時間軸產生，內容逐句引用 `narration-assets.json` 的 cues，非估算閱讀速度；片尾與句間留白不顯示字幕。如重新配音、換語速或改轉場長度，須重新製作時間軸與字幕。

## 四版本逐頁製作清單

下列字幕每頁由零起算，對應同名 MP3。只有劇場有完整合併 VTT；其他版本若另製影片，需依各頁音長重新累加。

'''
    for mode, version in story['versions'].items():
        spec += f'### {version["age"]}／{version["label"]}\n\n'
        for index, page in enumerate(version['pages']):
            asset = next(p for p in manifest['pages'] if p['file'] == story['audio'][mode][index])
            spec += f'- 第{index+1}頁〈{page["title"]}〉：場景{page["scene"]+1}；{descriptions[page["scene"]]} 旁白 `{asset["file"]}`（原始取樣長度 {asset["seconds"]:.3f} 秒）；字幕 `{asset["id"]}.zh-TW.vtt`。\n'
            spec += '  旁白：' + '／'.join(c['text'] for c in asset['cues']) + '\n'
        spec += '\n'
    spec += '''## 交付與人工檢查

1. 先逐頁聽校台灣口音、多音字、輕聲與情緒停頓，再生成畫面。注音與合成語音可能不同，需各自校對。
2. 逐鏡確認人物數量、手指、積木位置與搭橋前後連續性，確保小車過橋能看懂。
3. 影片完成後核對總長、音畫同步、字幕起訖；確認沒有品牌、私人素材或未授權音樂。
4. 放入正式 MP4 與正式封面；在 `story.json` 的 `media.video` 加入檔名，將頂層 `videoStatus` 改為 `ready`，並更新 `productionNote`。保留有用的原文、朗讀稿及授權資料。
5. 更新製作包，執行 `npm test` 與 HTTP 驗證，再用瀏覽器實播影片與字幕。此次僅有朗讀與文字佔位，不代表影片已完成。
'''
    (ROOT / 'VIDEO_SPEC.md').write_text(spec)
    common = ['README.md', 'narration.json', 'narration-assets.json', 'generate_narration.py',
              'requirements.txt', 'MODEL-LICENSE.txt', 'prepare_assets.py', 'scene-descriptions.json',
              'story.json', 'VIDEO_SPEC.md', 'narrated.zh-TW.vtt']
    audio = [p['file'] for p in manifest['pages']]
    subtitles = [f'{p["id"]}.zh-TW.vtt' for p in manifest['pages']]
    for name in ['local-narration-kit.zip', 'story-production-kit.zip']:
        files = common + audio + subtitles
        if name == 'story-production-kit.zip':
            files += ['video-poster.png']
        with zipfile.ZipFile(ROOT / name, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for file in files:
                archive.write(ROOT / file, file)
    print(f'已製作21頁字幕、劇場字幕（{offset:.3f}秒）、交接規格與兩個下載包。')


if __name__ == '__main__':
    main()
