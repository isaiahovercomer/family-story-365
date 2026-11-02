# 喬治與父親朗讀素材

來源及改寫說明見 SOURCE_REVIEW.md，影片交接見 VIDEO_SPEC.md。

公開模型 MeloTTS-Chinese（vits-melo-tts-zh_en）需另備，不包含在此包。Python 安裝 requirements.txt；系統需 ffmpeg（libmp3lame）。

```sh
python generate_narration.py --model-dir /path/to/vits-melo-tts-zh_en --script narration.json --output /path/to/new-output --speed 0.78
```

輸出目錄須不存在。原始程式與第一篇一致，產出逐頁MP3、WAV、含逐句時間的manifest。交付MP3與VTT；WAV不提交。字幕以manifest的cues產生，時間格式為HH:MM:SS.mmm；劇場總字幕按每頁seconds累加。

原稿引用保留原書用字；改寫用臺灣福音書房慣用字。朗讀為合成女聲，仍需人工聽校及注音校對。TTS日誌可能略過人名分隔號「．」與分號「；」，字幕仍保留原字，需聽校停頓。不含詩歌、字型、模型或影片。
