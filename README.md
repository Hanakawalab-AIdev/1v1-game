# 2D Action Versus

HTML5 Canvasで作った、1台のキーボードで遊ぶ1v1対戦アクションゲームです（eスポーツ向け）。

- **P1（赤）**：A / D で移動、W でジャンプ
- **P2（青）**：← / → で移動、↑ でジャンプ
- 相手の頭を踏むと1点。先に5点取ったほうが勝ち。Enter で再戦、F1 でデバッグ表示

## 遊び方
`index.html` をブラウザで開くだけで遊べます。ローカルサーバーで開く場合は次のとおりです（Windows）。

```
pwsh -NoProfile -File serve.ps1
```

起動したら http://localhost:8123 を開いてください。

ルールと公平性のための仕組みは [spec.md](spec.md) にまとめています。
