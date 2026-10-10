import { setStrictAssertions } from './sim/fact-ledger'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@fontsource/fusion-pixel-12px-proportional-sc'
import './index.css'
import './ui/art/art.css'
import './ui/viewport.css'
import { GameViewport } from './ui/GameViewport'

// A2/S9:正式构建把账本断言降级为 warn(玩家侧不因数据异常炸掉);DEV 与测试保持严格
if (!import.meta.env.DEV) setStrictAssertions(false)
document.body.classList.add('desktop-game')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GameViewport><App /></GameViewport>
  </React.StrictMode>,
)
