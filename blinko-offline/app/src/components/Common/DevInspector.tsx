import { Inspector, InspectParams } from 'react-dev-inspector';

export default function DevInspector() {
  return (
    <Inspector
      keys={['control', 'alt', 'x']}
      onClickElement={({ codeInfo }: InspectParams) => {
        if (!codeInfo?.absolutePath) return;
        const { absolutePath, lineNumber, columnNumber } = codeInfo;
        window.open(`cursor://file/${absolutePath}:${lineNumber}:${columnNumber}`);
      }}
    />
  );
}
