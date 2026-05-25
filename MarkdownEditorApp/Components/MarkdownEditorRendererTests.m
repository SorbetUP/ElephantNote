#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#import <stdio.h>
#import "MarkdownEditor.h"
#import "MarkdownEditorRenderer.h"

static BOOL ExpectEqual(NSUInteger actual, NSUInteger expected, NSString *label) {
    if (actual == expected) {
        return YES;
    }

    fprintf(stderr, "FAIL: %s expected %lu but got %lu\n",
            label.UTF8String,
            (unsigned long)expected,
            (unsigned long)actual);
    return NO;
}

static BOOL ExpectMapping(MarkdownEditorRenderer *renderer,
                          NSString *sourceLine,
                          NSUInteger renderedLocation,
                          NSUInteger expectedSourceLocation,
                          NSString *label) {
    NSUInteger actual = [renderer sourceLocationForRenderedLocation:renderedLocation inSourceLine:sourceLine];
    return ExpectEqual(actual, expectedSourceLocation, label);
}

static NSUInteger LineStartForIndex(NSArray<NSString *> *lines, NSUInteger lineIndex) {
    NSUInteger start = 0;
    for (NSUInteger i = 0; i < lineIndex && i < lines.count; i++) {
        start += [lines[i] length] + 1;
    }
    return start;
}

static NSPoint WindowPointForInsertionLocation(NSTextView *textView, NSUInteger location) {
    NSLayoutManager *layoutManager = textView.layoutManager;
    NSTextContainer *textContainer = textView.textContainer;
    if (!layoutManager || !textContainer) {
        return NSZeroPoint;
    }

    NSUInteger textLength = textView.string.length;
    NSUInteger clampedLocation = MIN(location, textLength);
    NSUInteger glyphIndex = [layoutManager glyphIndexForCharacterAtIndex:clampedLocation];
    NSRect glyphRect = [layoutManager boundingRectForGlyphRange:NSMakeRange(glyphIndex, 0)
                                               inTextContainer:textContainer];
    NSPoint localPoint = NSMakePoint(NSMidX(glyphRect), NSMidY(glyphRect));
    return localPoint;
}

static BOOL ExpectCursorAfterRenderedHitTest(NSString *sourceDocument,
                                             NSUInteger initialActiveLine,
                                             NSUInteger targetLineIndex,
                                             NSString *visibleToken,
                                             NSUInteger tokenOffset,
                                             NSUInteger expectedSourceLineLocation,
                                             NSString *label) {
    [NSApplication sharedApplication];

    MarkdownEditor *editor = [[MarkdownEditor alloc] initWithFrame:NSMakeRect(0, 0, 800, 600)];
    [editor setMarkdownSource:sourceDocument];
    editor.string = sourceDocument;
    NSArray<NSString *> *sourceLines = [sourceDocument componentsSeparatedByString:@"\n"];
    editor.selectedRange = NSMakeRange(LineStartForIndex(sourceLines, initialActiveLine), 0);

    [editor forceRender];

    NSArray<NSString *> *renderedLines = [editor.string componentsSeparatedByString:@"\n"];
    if (initialActiveLine >= renderedLines.count || targetLineIndex >= renderedLines.count) {
        fprintf(stderr, "FAIL: %s invalid test lines\n", label.UTF8String);
        return NO;
    }

    NSString *targetRenderedLine = renderedLines[targetLineIndex];
    NSRange tokenRange = [targetRenderedLine rangeOfString:visibleToken];
    if (tokenRange.location == NSNotFound || tokenOffset > tokenRange.length) {
        fprintf(stderr, "FAIL: %s token not found in rendered line\n", label.UTF8String);
        return NO;
    }

    NSUInteger clickLocation = LineStartForIndex(renderedLines, targetLineIndex) + tokenRange.location + tokenOffset;
    NSPoint renderedPoint = WindowPointForInsertionLocation(editor, clickLocation);
    NSUInteger hitTestLocation = [editor markdownInsertionIndexForPoint:renderedPoint];
    editor.selectedRange = NSMakeRange(hitTestLocation, 0);
    [editor forceRender];

    NSArray<NSString *> *finalLines = [editor.string componentsSeparatedByString:@"\n"];
    if (targetLineIndex >= finalLines.count) {
        fprintf(stderr, "FAIL: %s final target line missing\n", label.UTF8String);
        return NO;
    }

    NSUInteger finalLineStart = LineStartForIndex(finalLines, targetLineIndex);
    NSUInteger finalLineLocation = editor.selectedRange.location >= finalLineStart ? editor.selectedRange.location - finalLineStart : 0;
    return ExpectEqual(finalLineLocation, expectedSourceLineLocation, label);
}

static BOOL ExpectEnterAtRenderedLineEndMovesToNextLine(NSString *sourceDocument,
                                                        NSUInteger initialActiveLine,
                                                        NSUInteger targetLineIndex,
                                                        NSUInteger expectedCursorLocation,
                                                        NSString *label) {
    [NSApplication sharedApplication];

    MarkdownEditor *editor = [[MarkdownEditor alloc] initWithFrame:NSMakeRect(0, 0, 800, 600)];
    [editor setMarkdownSource:sourceDocument];
    editor.string = sourceDocument;

    NSArray<NSString *> *sourceLines = [sourceDocument componentsSeparatedByString:@"\n"];
    editor.selectedRange = NSMakeRange(LineStartForIndex(sourceLines, initialActiveLine), 0);
    [editor forceRender];

    NSArray<NSString *> *renderedLines = [editor.string componentsSeparatedByString:@"\n"];
    if (targetLineIndex >= renderedLines.count) {
        fprintf(stderr, "FAIL: %s invalid target line\n", label.UTF8String);
        return NO;
    }

    NSUInteger renderedLineStart = LineStartForIndex(renderedLines, targetLineIndex);
    NSUInteger renderedLineEnd = renderedLineStart + [renderedLines[targetLineIndex] length];
    editor.selectedRange = NSMakeRange(renderedLineEnd, 0);

    [editor insertNewline:nil];
    [editor forceRender];

    if (editor.selectedRange.location != expectedCursorLocation) {
        fprintf(stderr, "FAIL: %s expected cursor %lu but got %lu\n",
                label.UTF8String,
                (unsigned long)expectedCursorLocation,
                (unsigned long)editor.selectedRange.location);
        return NO;
    }

    NSArray<NSString *> *finalLines = [editor.string componentsSeparatedByString:@"\n"];
    if (finalLines.count < targetLineIndex + 2) {
        fprintf(stderr, "FAIL: %s missing inserted line\n", label.UTF8String);
        return NO;
    }

    if (![finalLines[targetLineIndex] isEqualToString:@"Gra"]) {
        fprintf(stderr, "FAIL: %s expected rendered line to stay visible as Gra but got %s\n",
                label.UTF8String,
                finalLines[targetLineIndex].UTF8String);
        return NO;
    }

    return YES;
}

static BOOL ExpectEditingCommandPreservesOtherMarkdownLines(SEL selector, NSString *label) {
    [NSApplication sharedApplication];

    NSString *sourceDocument = @"Intro\n**Gra**\n*Italique*\n==Surligné==";
    MarkdownEditor *editor = [[MarkdownEditor alloc] initWithFrame:NSMakeRect(0, 0, 800, 600)];
    [editor setMarkdownSource:sourceDocument];
    editor.string = sourceDocument;

    NSArray<NSString *> *sourceLines = [sourceDocument componentsSeparatedByString:@"\n"];
    NSUInteger lineStart = LineStartForIndex(sourceLines, 1);
    editor.selectedRange = NSMakeRange(lineStart + [sourceLines[1] length], 0);
    [editor forceRender];

    if (selector == @selector(insertNewline:)) {
        [editor insertNewline:nil];
    } else if (selector == @selector(insertTab:)) {
        [editor insertTab:nil];
    } else if (selector == @selector(deleteBackward:)) {
        [editor deleteBackward:nil];
    }
    [editor forceRender];

    NSArray<NSString *> *finalLines = [editor.string componentsSeparatedByString:@"\n"];
    if (finalLines.count < 4) {
        fprintf(stderr, "FAIL: %s expected at least 4 lines but got %lu\n",
                label.UTF8String,
                (unsigned long)finalLines.count);
        return NO;
    }

    NSUInteger italicIndex = selector == @selector(insertNewline:) ? 3 : 2;
    NSUInteger highlightIndex = selector == @selector(insertNewline:) ? 4 : 3;

    if (finalLines.count <= highlightIndex) {
        fprintf(stderr, "FAIL: %s missing expected rendered lines after edit\n", label.UTF8String);
        return NO;
    }

    if (![finalLines[italicIndex] isEqualToString:@"Italique"]) {
        fprintf(stderr, "FAIL: %s expected italic line to stay rendered but got %s\n",
                label.UTF8String,
                finalLines[italicIndex].UTF8String);
        return NO;
    }

    if (![finalLines[highlightIndex] isEqualToString:@"Surligné"]) {
        fprintf(stderr, "FAIL: %s expected highlighted line to stay rendered but got %s\n",
                label.UTF8String,
                finalLines[highlightIndex].UTF8String);
        return NO;
    }

    return YES;
}

static BOOL ExpectBackspaceKeepsCaretBeforeMarkdownBoundaries(NSString *label) {
    [NSApplication sharedApplication];

    NSString *sourceDocument = @"Intro\n++Souligné++";
    MarkdownEditor *editor = [[MarkdownEditor alloc] initWithFrame:NSMakeRect(0, 0, 800, 600)];
    [editor setMarkdownSource:sourceDocument];
    editor.string = sourceDocument;

    NSArray<NSString *> *sourceLines = [sourceDocument componentsSeparatedByString:@"\n"];
    NSUInteger lineStart = LineStartForIndex(sourceLines, 1);
    editor.selectedRange = NSMakeRange(lineStart + [sourceLines[1] length], 0);
    [editor forceRender];

    [editor deleteBackward:nil];
    [editor forceRender];

    NSArray<NSString *> *finalLines = [editor.string componentsSeparatedByString:@"\n"];
    if (finalLines.count < 2) {
        fprintf(stderr, "FAIL: %s missing rendered line\n", label.UTF8String);
        return NO;
    }

    if (![finalLines[1] containsString:@"Souligné"]) {
        fprintf(stderr, "FAIL: %s expected underline text to stay present but got %s\n",
                label.UTF8String,
                finalLines[1].UTF8String);
        return NO;
    }

    NSUInteger expectedCaret = lineStart + [sourceLines[1] length] - 1;
    if (editor.selectedRange.location != expectedCaret) {
        fprintf(stderr, "FAIL: %s expected caret %lu but got %lu\n",
                label.UTF8String,
                (unsigned long)expectedCaret,
                (unsigned long)editor.selectedRange.location);
        return NO;
    }

    return YES;
}

static BOOL ExpectSelectionSurvivesRender(NSString *sourceDocument, NSRange selection, NSString *label) {
    [NSApplication sharedApplication];

    MarkdownEditor *editor = [[MarkdownEditor alloc] initWithFrame:NSMakeRect(0, 0, 800, 600)];
    [editor setMarkdownSource:sourceDocument];
    editor.string = sourceDocument;
    editor.selectedRange = selection;
    [editor forceRender];

    if (editor.selectedRange.location != selection.location || editor.selectedRange.length != selection.length) {
        fprintf(stderr, "FAIL: %s expected selection {%lu,%lu} but got {%lu,%lu}\n",
                label.UTF8String,
                (unsigned long)selection.location,
                (unsigned long)selection.length,
                (unsigned long)editor.selectedRange.location,
                (unsigned long)editor.selectedRange.length);
        return NO;
    }

    return YES;
}

static BOOL ExpectPasteThenEnterPreservesMarkdown(NSString *sourceDocument,
                                                  NSUInteger initialActiveLine,
                                                  NSUInteger targetLineIndex,
                                                  NSString *pasteString,
                                                  NSString *expectedSnippet,
                                                  NSString *label) {
    [NSApplication sharedApplication];

    MarkdownEditor *editor = [[MarkdownEditor alloc] initWithFrame:NSMakeRect(0, 0, 800, 600)];
    [editor setMarkdownSource:sourceDocument];
    editor.string = sourceDocument;

    NSArray<NSString *> *sourceLines = [sourceDocument componentsSeparatedByString:@"\n"];
    editor.selectedRange = NSMakeRange(LineStartForIndex(sourceLines, initialActiveLine), 0);
    [editor forceRender];

    NSArray<NSString *> *renderedLines = [editor.string componentsSeparatedByString:@"\n"];
    if (targetLineIndex >= renderedLines.count) {
        fprintf(stderr, "FAIL: %s invalid target line\n", label.UTF8String);
        return NO;
    }

    NSUInteger lineStart = LineStartForIndex(renderedLines, targetLineIndex);
    NSUInteger lineEnd = lineStart + [renderedLines[targetLineIndex] length];
    editor.selectedRange = NSMakeRange(lineEnd, 0);

    NSPasteboard *pasteboard = [NSPasteboard pasteboardWithUniqueName];
    [pasteboard clearContents];
    if (![pasteboard setString:pasteString forType:NSPasteboardTypeString]) {
        fprintf(stderr, "FAIL: %s could not seed pasteboard\n", label.UTF8String);
        return NO;
    }

    [editor paste:pasteboard];
    [editor insertNewline:nil];
    [editor forceRender];

    NSString *finalDocument = editor.string ?: @"";
    if (![finalDocument containsString:expectedSnippet]) {
        fprintf(stderr, "FAIL: %s expected final document to contain %s but got %s\n",
                label.UTF8String,
                expectedSnippet.UTF8String,
                finalDocument.UTF8String);
        return NO;
    }

    return YES;
}

static BOOL ExpectMultilinePasteThenEnterPreservesMarkdown(NSString *sourceDocument,
                                                           NSUInteger initialActiveLine,
                                                           NSUInteger targetLineIndex,
                                                           NSString *pasteString,
                                                           NSArray<NSString *> *expectedSnippets,
                                                           NSString *label) {
    [NSApplication sharedApplication];

    MarkdownEditor *editor = [[MarkdownEditor alloc] initWithFrame:NSMakeRect(0, 0, 800, 600)];
    [editor setMarkdownSource:sourceDocument];
    editor.string = sourceDocument;

    NSArray<NSString *> *sourceLines = [sourceDocument componentsSeparatedByString:@"\n"];
    editor.selectedRange = NSMakeRange(LineStartForIndex(sourceLines, initialActiveLine), 0);
    [editor forceRender];

    NSArray<NSString *> *renderedLines = [editor.string componentsSeparatedByString:@"\n"];
    if (targetLineIndex >= renderedLines.count) {
        fprintf(stderr, "FAIL: %s invalid target line\n", label.UTF8String);
        return NO;
    }

    NSUInteger lineStart = LineStartForIndex(renderedLines, targetLineIndex);
    NSUInteger lineEnd = lineStart + [renderedLines[targetLineIndex] length];
    editor.selectedRange = NSMakeRange(lineEnd, 0);

    NSPasteboard *pasteboard = [NSPasteboard pasteboardWithUniqueName];
    [pasteboard clearContents];
    if (![pasteboard setString:pasteString forType:NSPasteboardTypeString]) {
        fprintf(stderr, "FAIL: %s could not seed pasteboard\n", label.UTF8String);
        return NO;
    }

    [editor paste:pasteboard];
    [editor insertNewline:nil];
    [editor forceRender];

    BOOL allFound = YES;
    for (NSString *snippet in expectedSnippets) {
        if (![editor.string containsString:snippet]) {
            fprintf(stderr, "FAIL: %s expected pasted snippet %s but got %s\n",
                    label.UTF8String,
                    snippet.UTF8String,
                    editor.string.UTF8String);
            allFound = NO;
        }
    }

    return allFound;
}

static BOOL ExpectMultiLineSelectionKeepsAllSelectedLinesActive(NSString *sourceDocument, NSString *label) {
    [NSApplication sharedApplication];

    MarkdownEditor *editor = [[MarkdownEditor alloc] initWithFrame:NSMakeRect(0, 0, 800, 600)];
    [editor setMarkdownSource:sourceDocument];
    editor.string = sourceDocument;

    NSArray<NSString *> *lines = [sourceDocument componentsSeparatedByString:@"\n"];
    if (lines.count < 4) {
        fprintf(stderr, "FAIL: %s invalid source document\n", label.UTF8String);
        return NO;
    }

    NSUInteger start = LineStartForIndex(lines, 1);
    NSUInteger end = LineStartForIndex(lines, 3);
    if (lines.count > 2) {
        end = LineStartForIndex(lines, 2) + [lines[2] length];
    }
    editor.selectedRange = NSMakeRange(start, end - start);
    [editor forceRender];

    NSArray<NSString *> *renderedLines = [editor.string componentsSeparatedByString:@"\n"];
    if (renderedLines.count < 4) {
        fprintf(stderr, "FAIL: %s missing rendered lines\n", label.UTF8String);
        return NO;
    }

    if (![renderedLines[1] isEqualToString:@"**Gra**"]) {
        fprintf(stderr, "FAIL: %s expected first selected line to keep markers but got %s\n",
                label.UTF8String,
                renderedLines[1].UTF8String);
        return NO;
    }

    if (![renderedLines[2] isEqualToString:@"*Italique*"]) {
        fprintf(stderr, "FAIL: %s expected second selected line to keep markers but got %s\n",
                label.UTF8String,
                renderedLines[2].UTF8String);
        return NO;
    }

    if ([renderedLines[3] isEqualToString:@"++Souligné++"]) {
        fprintf(stderr, "FAIL: %s expected unselected line to stay rendered but it kept raw markers\n", label.UTF8String);
        return NO;
    }

    if (![renderedLines[3] containsString:@"Souligné"]) {
        fprintf(stderr, "FAIL: %s expected unselected line to keep rendered text but got %s\n",
                label.UTF8String,
                renderedLines[3].UTF8String);
        return NO;
    }

    return YES;
}

static BOOL ExpectActiveLineRetainsVisibleMarkdownAndStyle(NSString *sourceDocument,
                                                           NSUInteger activeLineIndex,
                                                           NSUInteger sampleCharIndex,
                                                           NSString *expectedLine,
                                                           NSString *label,
                                                           BOOL (^attributeCheck)(NSDictionary *attributes)) {
    MarkdownEditorRenderer *renderer = [[MarkdownEditorRenderer alloc] init];
    NSAttributedString *rendered = [renderer renderMarkdown:sourceDocument activeLineIndex:activeLineIndex];
    NSArray<NSString *> *renderedLines = [rendered.string componentsSeparatedByString:@"\n"];
    if (activeLineIndex >= renderedLines.count) {
        fprintf(stderr, "FAIL: %s invalid active line\n", label.UTF8String);
        return NO;
    }

    NSString *line = renderedLines[activeLineIndex];
    if (![line isEqualToString:expectedLine]) {
        fprintf(stderr, "FAIL: %s expected line %s but got %s\n",
                label.UTF8String,
                expectedLine.UTF8String,
                line.UTF8String);
        return NO;
    }

    NSUInteger lineStart = LineStartForIndex(renderedLines, activeLineIndex);
    NSUInteger index = MIN(lineStart + sampleCharIndex, rendered.length > 0 ? rendered.length - 1 : 0);
    NSDictionary *attributes = [rendered attributesAtIndex:index effectiveRange:NULL];
    if (!attributeCheck(attributes)) {
        fprintf(stderr, "FAIL: %s attribute check failed\n", label.UTF8String);
        return NO;
    }

    return YES;
}

int main(void) {
    @autoreleasepool {
        MarkdownEditorRenderer *renderer = [[MarkdownEditorRenderer alloc] init];
        BOOL ok = YES;

        ok &= ExpectMapping(renderer, @"# Titre", 0, 2, @"header:start");
        ok &= ExpectMapping(renderer, @"# Titre", 1, 3, @"header:inside-title");

        ok &= ExpectMapping(renderer, @"**Gra**", 0, 2, @"bold:start");
        ok &= ExpectMapping(renderer, @"**Gra**", 1, 3, @"bold:between-g-and-r");
        ok &= ExpectMapping(renderer, @"**Gra**", 2, 4, @"bold:between-r-and-a");

        ok &= ExpectMapping(renderer, @"*Italique*", 0, 1, @"italic:start");
        ok &= ExpectMapping(renderer, @"*Italique*", 1, 2, @"italic:after-first-letter");

        ok &= ExpectMapping(renderer, @"==Surligné==", 0, 2, @"highlight:start");
        ok &= ExpectMapping(renderer, @"==Surligné==", 1, 3, @"highlight:after-first-letter");

        ok &= ExpectMapping(renderer, @"++Souligné++", 0, 2, @"underline:start");
        ok &= ExpectMapping(renderer, @"++Souligné++", 1, 3, @"underline:after-first-letter");

        ok &= ExpectMapping(renderer, @"~~Barré~~", 0, 2, @"strike:start");
        ok &= ExpectMapping(renderer, @"~~Barré~~", 1, 3, @"strike:inside");

        ok &= ExpectMapping(renderer, @"`Code`", 0, 1, @"code:start");
        ok &= ExpectMapping(renderer, @"`Code`", 1, 2, @"code:inside");

        ok &= ExpectMapping(renderer, @"- **Gra**", 2, 5, @"list:bold:between-g-and-r");
        ok &= ExpectMapping(renderer, @"> Citation", 0, 2, @"quote:start");

        ok &= ExpectMapping(renderer, @"[Lien](https://example.com)", 0, 1, @"link:start");
        ok &= ExpectMapping(renderer, @"[Lien](https://example.com)", 1, 2, @"link:between-l-and-i");

        ok &= ExpectCursorAfterRenderedHitTest(@"Intro\n**Gra**",
                                          0,
                                          1,
                                          @"Gra",
                                          1,
                                          3,
                                          @"editor:bold-cursor");

        ok &= ExpectCursorAfterRenderedHitTest(@"Intro\n*Italique*",
                                          0,
                                          1,
                                          @"Italique",
                                          1,
                                          2,
                                          @"editor:italic-cursor");

        ok &= ExpectCursorAfterRenderedHitTest(@"Intro\n==Surligné==",
                                          0,
                                          1,
                                          @"Surligné",
                                          1,
                                          3,
                                          @"editor:highlight-cursor");

        ok &= ExpectCursorAfterRenderedHitTest(@"Intro\n++Souligné++",
                                          0,
                                          1,
                                          @"Souligné",
                                          1,
                                          3,
                                          @"editor:underline-cursor");

        ok &= ExpectCursorAfterRenderedHitTest(@"Intro\n- **Gra**",
                                          0,
                                          1,
                                          @"Gra",
                                          1,
                                          5,
                                          @"editor:list-bold-cursor");

        ok &= ExpectCursorAfterRenderedHitTest(@"Intro\n- **Gra** *Italique* ==Sur== ++Sou++",
                                          0,
                                          1,
                                          @"Gra",
                                          1,
                                          5,
                                          @"editor:mixed-styles-cursor");

        ok &= ExpectCursorAfterRenderedHitTest(@"Intro\n[Lien](https://example.com)",
                                          0,
                                          1,
                                          @"Lien",
                                          1,
                                          2,
                                          @"editor:link-cursor");

        ok &= ExpectEnterAtRenderedLineEndMovesToNextLine(@"Intro\n**Gra**",
                                                         0,
                                                         1,
                                                         10,
                                                         @"editor:return-at-line-end");

        ok &= ExpectEditingCommandPreservesOtherMarkdownLines(@selector(insertNewline:), @"editor:newline-preserves-markdown");
        ok &= ExpectEditingCommandPreservesOtherMarkdownLines(@selector(insertTab:), @"editor:tab-preserves-markdown");
        ok &= ExpectEditingCommandPreservesOtherMarkdownLines(@selector(deleteBackward:), @"editor:backspace-preserves-markdown");
        ok &= ExpectBackspaceKeepsCaretBeforeMarkdownBoundaries(@"editor:backspace-markdown-boundary");
        ok &= ExpectSelectionSurvivesRender(@"Intro\n**Gra**\n*Italique*",
                                            NSMakeRange(LineStartForIndex(@[@"Intro", @"**Gra**", @"*Italique*"], 1) + 2, 3),
                                            @"editor:selection-survives-render");
        ok &= ExpectMultiLineSelectionKeepsAllSelectedLinesActive(@"Intro\n**Gra**\n*Italique*\n++Souligné++",
                                                                  @"editor:multi-line-selection-active");

        ok &= ExpectPasteThenEnterPreservesMarkdown(@"Intro\n**Gra**\n*Italique*\n++Souligné++",
                                                    0,
                                                    1,
                                                    @"COLLE",
                                                    @"COLLE",
                                                    @"editor:paste-then-enter-preserves-text");

        ok &= ExpectPasteThenEnterPreservesMarkdown(@"Intro\n++Souligné++\n*Italique*\n# Titre",
                                                    0,
                                                    1,
                                                    @"COLLE",
                                                    @"COLLE",
                                                    @"editor:paste-underline-then-enter-preserves-text");

        ok &= ExpectMultilinePasteThenEnterPreservesMarkdown(@"Intro\n**Gra**\n*Italique*\n# Titre",
                                                              0,
                                                              1,
                                                              @"COLLE1\nCOLLE2",
                                                              @[ @"COLLE1", @"COLLE2", @"Italique", @"Titre" ],
                                                              @"editor:paste-multiline-then-enter-preserves-text");

        ok &= ExpectActiveLineRetainsVisibleMarkdownAndStyle(@"# Titre",
                                                             0,
                                                             2,
                                                             @"# Titre",
                                                             @"active:title-visible",
                                                             ^BOOL(NSDictionary *attributes) {
            return [attributes[NSFontAttributeName] pointSize] >= 18.0;
        });

        ok &= ExpectActiveLineRetainsVisibleMarkdownAndStyle(@"**Gra**",
                                                             0,
                                                             2,
                                                             @"**Gra**",
                                                             @"active:bold-visible",
                                                             ^BOOL(NSDictionary *attributes) {
            return [attributes[NSFontAttributeName] fontDescriptor].symbolicTraits & NSFontDescriptorTraitBold;
        });

        ok &= ExpectActiveLineRetainsVisibleMarkdownAndStyle(@"*Italique*",
                                                             0,
                                                             2,
                                                             @"*Italique*",
                                                             @"active:italic-visible",
                                                             ^BOOL(NSDictionary *attributes) {
            return [attributes[NSUnderlineStyleAttributeName] integerValue] == 0;
        });

        ok &= ExpectActiveLineRetainsVisibleMarkdownAndStyle(@"++Souligné++",
                                                             0,
                                                             2,
                                                             @"++Souligné++",
                                                             @"active:underline-visible",
                                                             ^BOOL(NSDictionary *attributes) {
            return [attributes[NSUnderlineStyleAttributeName] integerValue] == NSUnderlineStyleSingle;
        });

        if (!ok) {
            return 1;
        }

        printf("All MarkdownEditorRenderer mapping tests passed.\n");
        return 0;
    }
}
