import { useRef, useEffect } from "react";
import { EditorView, lineNumbers, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { defaultKeymap } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";

interface CodeEditorProps {
  code: string;
  id: string;
}

export function CodeEditor({ code, id }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView>();

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: code,
      extensions: [
        lineNumbers(),
        javascript({ typescript: true }),
        oneDark,
        syntaxHighlighting(defaultHighlightStyle),
        keymap.of(defaultKeymap),
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    // Expose getText for codapi-snippet to read
    (containerRef.current as any).__codapiGetText = () =>
      view.state.doc.toString();

    return () => view.destroy();
  }, [code]);

  return <div ref={containerRef} id={id} className="cm-wrapper" />;
}
