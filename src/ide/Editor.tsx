// Monaco-based embedded C editor: diagnostics markers, breakpoint gutter,
// current-line highlight, SFR completions and hover help.

import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { sourceFor, useLab } from '../app/store.ts';
import { sim } from '../app/sim.ts';
import { getExperiment } from '../experiments/experiments.ts';
import { completionsFor, hoverDoc } from './sfrdocs.ts';
import './editor.css';

(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = { getWorker: () => new EditorWorker() };

let themeDefined = false;
function defineTheme() {
  if (themeDefined) return;
  themeDefined = true;
  monaco.editor.defineTheme('vlab-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6a7a8c', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c792ea' },
      { token: 'keyword.directive', foreground: 'f78c6c' },
      { token: 'number', foreground: 'f9c97c' },
      { token: 'number.hex', foreground: 'f9c97c' },
      { token: 'string', foreground: 'a5d6a7' },
      { token: 'identifier', foreground: 'dbe3ee' },
      { token: 'type', foreground: '82aaff' },
      { token: 'delimiter', foreground: '9aa7b8' },
    ],
    colors: {
      'editor.background': '#12161c',
      'editor.lineHighlightBackground': '#1a2029',
      'editorLineNumber.foreground': '#4a5566',
      'editorLineNumber.activeForeground': '#b8c2d0',
      'editorGutter.background': '#12161c',
      'editor.selectionBackground': '#2b3a52',
      'editorIndentGuide.background1': '#1f2630',
      'editorWidget.background': '#171c23',
      'editorSuggestWidget.background': '#171c23',
      'editorSuggestWidget.selectedBackground': '#26303d',
      'scrollbarSlider.background': '#2d354277',
    },
  });
  monaco.languages.registerCompletionItemProvider('cpp', {
    triggerCharacters: ['.'],
    provideCompletionItems(model, position) {
      const arch = useLab.getState().arch;
      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
      const lineBefore = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      return { suggestions: completionsFor(arch, lineBefore, range) };
    },
  });
  monaco.languages.registerHoverProvider('cpp', {
    provideHover(model, position) {
      const w = model.getWordAtPosition(position);
      if (!w) return null;
      const doc = hoverDoc(useLab.getState().arch, w.word);
      return doc ? { contents: [{ value: doc }] } : null;
    },
  });
}

export function CodeEditor({ expId }: { expId: string }) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const decos = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const build = useLab((s) => s.build);
  const stoppedLine = useLab((s) => s.stoppedLine);
  const bps = useLab((s) => s.breakpoints[expId]);
  const fontSize = useLab((s) => s.editorFont);

  useEffect(() => {
    defineTheme();
    const ed = monaco.editor.create(host.current!, {
      value: sourceFor(expId),
      language: 'cpp',
      theme: 'vlab-dark',
      fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
      fontSize: useLab.getState().editorFont,
      lineHeight: Math.round(useLab.getState().editorFont * 1.54),
      minimap: { enabled: false },
      automaticLayout: true,
      glyphMargin: true,
      scrollBeyondLastLine: false,
      renderLineHighlight: 'all',
      smoothScrolling: true,
      tabSize: 4,
      padding: { top: 8 },
      fixedOverflowWidgets: true,
      'semanticHighlighting.enabled': false,
    });
    editor.current = ed;
    decos.current = ed.createDecorationsCollection();
    const sub = ed.onDidChangeModelContent(() => useLab.getState().setSource(expId, ed.getValue()));
    const mouse = ed.onMouseDown((e) => {
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN || e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS) {
        const line = e.target.position?.lineNumber;
        if (!line) return;
        useLab.getState().toggleBreakpoint(expId, line);
        sim.send({ type: 'breakpoints', lines: useLab.getState().breakpoints[expId] ?? [] });
      }
    });
    const onReset = () => ed.setValue(sourceFor(expId));
    window.addEventListener('vlab:source-reset', onReset);
    return () => { sub.dispose(); mouse.dispose(); ed.getModel()?.dispose(); ed.dispose(); window.removeEventListener('vlab:source-reset', onReset); };
  }, [expId]);

  useEffect(() => { editor.current?.updateOptions({ fontSize, lineHeight: Math.round(fontSize * 1.54) }); }, [fontSize]);

  // compiler diagnostics -> markers
  useEffect(() => {
    const model = editor.current?.getModel();
    if (!model) return;
    const markers = (build?.diagnostics ?? []).map((d) => ({
      startLineNumber: d.line, endLineNumber: d.line, startColumn: d.col, endColumn: d.col < 2 ? model.getLineMaxColumn(Math.min(d.line, model.getLineCount())) : d.col + 1,
      message: d.message,
      severity: d.severity === 'error' ? monaco.MarkerSeverity.Error : d.severity === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info,
    }));
    monaco.editor.setModelMarkers(model, 'compiler', markers);
  }, [build]);

  // breakpoints + execution point
  useEffect(() => {
    const list: monaco.editor.IModelDeltaDecoration[] = (bps ?? []).map((line) => ({
      range: new monaco.Range(line, 1, line, 1),
      options: { glyphMarginClassName: 'bp-glyph', glyphMarginHoverMessage: { value: 'Breakpoint' }, stickiness: 1 },
    }));
    if (stoppedLine) {
      list.push({ range: new monaco.Range(stoppedLine, 1, stoppedLine, 1), options: { isWholeLine: true, className: 'exec-line', glyphMarginClassName: 'exec-glyph' } });
      editor.current?.revealLineInCenterIfOutsideViewport(stoppedLine);
    }
    decos.current?.set(list);
  }, [bps, stoppedLine]);

  // jump-to-line requests from the Problems panel
  useEffect(() => {
    const go = (e: Event) => {
      const line = (e as CustomEvent<number>).detail;
      editor.current?.revealLineInCenter(line);
      editor.current?.setPosition({ lineNumber: line, column: 1 });
      editor.current?.focus();
    };
    window.addEventListener('vlab:goto-line', go);
    return () => window.removeEventListener('vlab:goto-line', go);
  }, []);

  const exp = getExperiment(expId);
  return (
    <div className="editor-wrap">
      <div className="editor-tabs">
        <div className="editor-tab on">
          <span className={`lang-dot ${exp?.arch}`} />
          main.c
          {useLab.getState().sources[expId] !== undefined && <span className="modified" title="Modified from the reference program">●</span>}
        </div>
        <div className="editor-tab-meta">{exp?.arch === 'mcs51' ? 'Keil C51 dialect' : 'XC8 (C99)'} · {exp?.mcu}</div>
      </div>
      <div className="editor-host" ref={host} />
    </div>
  );
}
