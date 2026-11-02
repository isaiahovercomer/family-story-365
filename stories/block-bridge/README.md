# 積木小橋再試一次

給台灣家庭的原創故事，以雨天積木遊戲練習挫折調適、表達需要與合作。四版本為 0–3 歲6頁、4–6 歲6頁、7–9 歲6頁、10–12 歲3頁；共21個逐頁 MP3，逐字注音格式沿用第一篇。

## 朗讀來源與重製

完整沿用第一篇 `local-narration-kit.zip` 中的 `generate_narration.py`、`requirements.txt` 與 `MODEL-LICENSE.txt`。工具為 sherpa-onnx 2.0.1／MeloTTS-Chinese，合成女聲試聽版，CPU、2執行緒、sid=0、speed=0.78；每句後停頓0.35秒，輸出44.1 kHz單聲道96 kbps MP3。引號移除、冒號改逗號僅用於語音，字幕保留原文。沒有付費服務、私人參考錄音或聲音克隆。

本次用 Python 3.13、Linux CPU 與 FFmpeg 重製；台灣口音、語氣與注音仍待逐句人工校對。

先安裝 Python、FFmpeg，準備虛擬環境：

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
curl -L --fail https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-melo-tts-zh_en.tar.bz2 -o model.tar.bz2
python3 -c "import tarfile; tarfile.open('model.tar.bz2').extractall('models', filter='data')"
.venv/bin/python generate_narration.py --model-dir models/vits-melo-tts-zh_en --script narration.json --output audio-new --speed 0.78
```

`model.onnx` 應為170429550位元組；輸出目錄必須不存在。模型先下載後可離線合成。不要把模型、虛擬環境或字型加進 Git。

人工聽校通過後，將 `audio-new` 裡的21個 MP3 與 `narration-assets.json` 複製到本資料夾（先備份前版），執行 `python3 prepare_assets.py` 重建逐頁 VTT、劇場合併 VTT、VIDEO_SPEC.md 與兩個 ZIP。字幕依原始取樣時間生成；調整文本或語速後不能沿用舊字幕。

## 視覺與影片

本輪不含影片與 AI 圖片。`video-poster.png` 為 Pillow 排版的1280×720文字封面，使用系統公開 Noto Sans CJK（SIL Open Font License，未打包字型）；六個 `scenes` 為文字 SVG 佔位。影片待補狀態為頂層 `videoStatus: "pending"`，因此 `media` 不引用不存在的 MP4。

請交接 [VIDEO_SPEC.md](VIDEO_SPEC.md)，內有六鏡精準時間軸、四版本21頁畫面描述、音檔與字幕對照、輸出規格與正式媒體接入方式。

## 授權與限制

文字與文字佔位為本篇新寫的原創內容；不含真實人名、品牌、宗教說教、歌詞或私人素材。幼兒積木活動須選適齡大積木並由大人陪同。

引擎：https://github.com/k2-fsa/sherpa-onnx （Apache-2.0）。模型原始專案：https://github.com/myshell-ai/MeloTTS （MIT）；模型：https://huggingface.co/myshell-ai/MeloTTS-Chinese 。模型授權原文見 `MODEL-LICENSE.txt`。本篇未新增不同的語音工具或聲音參數。
