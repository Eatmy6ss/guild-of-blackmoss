import React from 'react'
import ReactDOM from 'react-dom/client'
import { TestLab } from './TestLab'
import '@fontsource/fusion-pixel-12px-proportional-sc'
import '../../src/index.css'
import './lab.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><TestLab /></React.StrictMode>,
)
