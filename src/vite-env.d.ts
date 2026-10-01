/// <reference types="vite/client" />

/** 构建期由 vite define 注入的构建日期(YYYY-MM-DD) */
declare const __BUILD_DATE__: string

/** 试玩构建(inline-assets 单文件分发)为 true;正常构建为 false */
declare const __PLAYTEST__: boolean
