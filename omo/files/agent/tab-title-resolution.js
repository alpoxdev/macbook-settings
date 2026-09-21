"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTerminalTabTitle = resolveTerminalTabTitle;
exports.resolveUnifiedTabLabel = resolveUnifiedTabLabel;
const opencode_terminal_title_1 = require("./opencode-terminal-title");
function resolveTerminalTabTitle(tab, generatedTitlesEnabled, fallback = '') {
    const liveTitle = tab.title?.trim() ?? '';
    return (tab.customTitle?.trim() ||
        tab.quickCommandLabel?.trim() ||
        ((0, opencode_terminal_title_1.isMeaningfulOpenCodeTerminalTitle)(liveTitle) ? liveTitle : '') ||
        tab.aiVaultTitle?.title.trim() ||
        (generatedTitlesEnabled ? tab.generatedTitle?.trim() : '') ||
        liveTitle ||
        fallback);
}
function resolveUnifiedTabLabel(tab, generatedTitlesEnabled, fallback = '') {
    const liveLabel = tab?.label?.trim() ?? '';
    return (tab?.customLabel?.trim() ||
        tab?.quickCommandLabel?.trim() ||
        ((0, opencode_terminal_title_1.isMeaningfulOpenCodeTerminalTitle)(liveLabel) ? liveLabel : '') ||
        tab?.aiVaultTitle?.title.trim() ||
        (generatedTitlesEnabled ? tab?.generatedLabel?.trim() : '') ||
        liveLabel ||
        fallback);
}
