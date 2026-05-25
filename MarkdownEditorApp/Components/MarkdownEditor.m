#import "MarkdownEditor.h"
#import "MarkdownEditorRenderer.h"

@interface MarkdownEditor ()
{
    NSString *_markdownSource;
}
@property (strong, nonatomic) MarkdownEditorRenderer *renderer;
@property (assign, nonatomic) BOOL isRendering;
@property (assign, nonatomic) BOOL renderScheduled;
@property (assign, nonatomic) BOOL applyingSourceMutation;
@property (assign, nonatomic) NSUInteger pendingSourceSelectionLineIndex;
@property (assign, nonatomic) NSUInteger pendingSourceSelectionLineOffset;
@property (assign, nonatomic) BOOL hasPendingSourceSelection;
@property (copy, nonatomic) NSString *lastRenderedSource;
@property (assign, nonatomic) NSRange lastRenderedActiveLineRange;
@end

@implementation MarkdownEditor

- (instancetype)initWithFrame:(NSRect)frame {
    self = [super initWithFrame:frame];
    if (self) {
        [self setupEditor];
        [self scheduleRender];
    }
    return self;
}

- (void)dealloc {
    [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (void)setupEditor {
    self.renderer = [[MarkdownEditorRenderer alloc] init];
    self.isRendering = NO;
    self.renderScheduled = NO;
    self.applyingSourceMutation = NO;
    self.hasPendingSourceSelection = NO;
    self.pendingSourceSelectionLineIndex = 0;
    self.pendingSourceSelectionLineOffset = 0;
    _markdownSource = nil;
    self.lastRenderedSource = nil;
    self.lastRenderedActiveLineRange = NSMakeRange(NSNotFound, 0);

    self.richText = YES;
    self.importsGraphics = NO;
    self.allowsUndo = YES;
    self.usesFontPanel = NO;
    self.usesRuler = NO;
    self.verticallyResizable = YES;
    self.horizontallyResizable = NO;
    self.backgroundColor = NSColor.textBackgroundColor;
    self.textColor = NSColor.labelColor;
    self.insertionPointColor = NSColor.systemBlueColor;
    self.font = [NSFont monospacedSystemFontOfSize:16 weight:NSFontWeightRegular];
    self.minSize = NSMakeSize(0.0, 0.0);
    self.maxSize = NSMakeSize(FLT_MAX, FLT_MAX);
    self.textContainer.widthTracksTextView = YES;
    self.textContainer.containerSize = NSMakeSize(FLT_MAX, FLT_MAX);
    self.delegate = self;

    NSMutableParagraphStyle *paragraphStyle = [[NSMutableParagraphStyle alloc] init];
    paragraphStyle.lineHeightMultiple = 1.55;
    paragraphStyle.paragraphSpacing = 0.0;
    paragraphStyle.paragraphSpacingBefore = 0.0;

    self.typingAttributes = @{
        NSFontAttributeName: self.font ?: [NSFont monospacedSystemFontOfSize:16 weight:NSFontWeightRegular],
        NSForegroundColorAttributeName: self.textColor ?: NSColor.labelColor,
        NSParagraphStyleAttributeName: paragraphStyle
    };

    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(textDidChange:)
                                                 name:NSTextDidChangeNotification
                                               object:self];
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(selectionDidChange:)
                                                 name:NSTextViewDidChangeSelectionNotification
                                               object:self];
}

- (void)setMarkdownSource:(NSString *)markdownSource {
    _markdownSource = [markdownSource copy];
}

- (void)forceRender {
    if (self.isRendering) {
        return;
    }

    NSString *source = _markdownSource ?: self.string ?: @"";
    NSRange activeLineRange = [self activeLineRangeForCurrentSelection];
    if (self.lastRenderedSource && [self.lastRenderedSource isEqualToString:source] && NSEqualRanges(self.lastRenderedActiveLineRange, activeLineRange)) {
        return;
    }

    self.isRendering = YES;

    @try {
        NSRange selection = self.selectedRange;
        NSString *currentDocument = self.string ?: @"";
        NSArray<NSString *> *currentLines = [currentDocument componentsSeparatedByString:@"\n"];
        NSArray<NSString *> *sourceLines = [source componentsSeparatedByString:@"\n"];
        NSUInteger selectedLineIndex = [self lineIndexForLocation:selection.location inLines:currentLines];
        NSUInteger selectedLineStart = [self absoluteLocationForLineIndex:selectedLineIndex inLines:currentLines];
        NSUInteger renderedLineLocation = selection.location - selectedLineStart;
        NSString *selectedSourceLine = selectedLineIndex < sourceLines.count ? sourceLines[selectedLineIndex] : @"";
        NSUInteger sourceLineLocation = renderedLineLocation;
        NSString *selectedRenderedLine = selectedLineIndex < currentLines.count ? currentLines[selectedLineIndex] : @"";
        if (![selectedRenderedLine isEqualToString:selectedSourceLine] &&
            selectedLineIndex < sourceLines.count &&
            !NSLocationInRange(selectedLineIndex, self.lastRenderedActiveLineRange)) {
            sourceLineLocation = [self.renderer sourceLocationForRenderedLocation:renderedLineLocation
                                                                     inSourceLine:selectedSourceLine];
        }

        NSAttributedString *rendered = [self.renderer renderMarkdown:source activeLineRange:activeLineRange];
        if (rendered) {
            [self.textStorage beginEditing];
            [self.textStorage setAttributedString:rendered];
            [self.textStorage endEditing];

            NSUInteger restoredSelection = NSNotFound;
            if (self.hasPendingSourceSelection) {
                NSArray<NSString *> *renderedLines = [rendered.string componentsSeparatedByString:@"\n"];
                restoredSelection = [self absoluteLocationForLineIndex:self.pendingSourceSelectionLineIndex
                                                             lineOffset:self.pendingSourceSelectionLineOffset
                                                                inLines:renderedLines];
            } else {
                restoredSelection = [self absoluteLocationForLineIndex:activeLineRange.location
                                                             lineOffset:sourceLineLocation
                                                               inLines:[rendered.string componentsSeparatedByString:@"\n"]];
            }
            if (restoredSelection != NSNotFound && restoredSelection <= self.string.length) {
                [self setSelectedRange:NSMakeRange(restoredSelection, selection.length)];
            }
        }

        self.lastRenderedSource = [source copy];
        self.lastRenderedActiveLineRange = activeLineRange;
        self.hasPendingSourceSelection = NO;
    } @catch (NSException *exception) {
        NSLog(@"⚠️ Markdown render failed: %@", exception.reason);
        NSMutableAttributedString *fallback = [[NSMutableAttributedString alloc] initWithString:source];
        if (fallback.length > 0) {
            [fallback addAttributes:@{
                NSFontAttributeName: [NSFont monospacedSystemFontOfSize:16 weight:NSFontWeightRegular],
                NSForegroundColorAttributeName: NSColor.labelColor
            } range:NSMakeRange(0, fallback.length)];
        }
        [self.textStorage beginEditing];
        [self.textStorage setAttributedString:fallback];
        [self.textStorage endEditing];
        self.lastRenderedSource = [source copy];
        self.lastRenderedActiveLineRange = activeLineRange;
    } @finally {
        self.isRendering = NO;
    }
}

- (NSUInteger)markdownInsertionIndexForPoint:(NSPoint)point {
    if (self.string.length == 0) {
        return 0;
    }

    NSUInteger index = [self characterIndexForInsertionAtPoint:point];
    return MIN(index, self.string.length);
}

- (NSUInteger)sourceLocationForRenderedSelection:(NSRange)selection {
    NSString *source = _markdownSource ?: self.string ?: @"";
    NSString *currentDocument = self.string ?: @"";
    NSArray<NSString *> *currentLines = [currentDocument componentsSeparatedByString:@"\n"];
    NSArray<NSString *> *sourceLines = [source componentsSeparatedByString:@"\n"];
    NSUInteger selectedLineIndex = [self lineIndexForLocation:selection.location inLines:currentLines];
    NSUInteger selectedLineStart = [self absoluteLocationForLineIndex:selectedLineIndex inLines:currentLines];
    NSUInteger renderedLineLocation = selection.location - selectedLineStart;
    NSString *selectedSourceLine = selectedLineIndex < sourceLines.count ? sourceLines[selectedLineIndex] : @"";
    NSString *selectedRenderedLine = selectedLineIndex < currentLines.count ? currentLines[selectedLineIndex] : @"";
    NSUInteger sourceLineStart = [self absoluteLocationForLineIndex:selectedLineIndex inLines:sourceLines];
    if ([selectedRenderedLine isEqualToString:selectedSourceLine]) {
        return sourceLineStart + renderedLineLocation;
    }
    return sourceLineStart + [self.renderer sourceLocationForRenderedLocation:renderedLineLocation inSourceLine:selectedSourceLine];
}

- (void)applySourceReplacement:(NSString *)replacement {
    NSString *source = _markdownSource ?: self.string ?: @"";
    NSRange selection = self.selectedRange;
    NSRange sourceRange = [self sourceRangeForRenderedSelection:selection];
    NSUInteger sourceLocation = sourceRange.location;
    NSUInteger deleteLength = sourceRange.length;

    if (sourceLocation > source.length) {
        sourceLocation = source.length;
    }
    if (deleteLength > source.length - sourceLocation) {
        deleteLength = source.length - sourceLocation;
    }

    NSMutableString *mutableSource = [source mutableCopy];
    [mutableSource replaceCharactersInRange:NSMakeRange(sourceLocation, deleteLength) withString:replacement ?: @""];
    _markdownSource = [mutableSource copy];

    NSUInteger newCursorLocation = MIN(sourceLocation + (replacement ?: @"").length, _markdownSource.length);
    NSArray<NSString *> *newSourceLines = [_markdownSource componentsSeparatedByString:@"\n"];
    NSUInteger pendingLineIndex = [self lineIndexForLocation:newCursorLocation inLines:newSourceLines];
    NSUInteger pendingLineStart = [self absoluteLocationForLineIndex:pendingLineIndex inLines:newSourceLines];
    NSUInteger pendingLineOffset = newCursorLocation >= pendingLineStart ? newCursorLocation - pendingLineStart : 0;

    self.applyingSourceMutation = YES;
    self.hasPendingSourceSelection = YES;
    self.pendingSourceSelectionLineIndex = pendingLineIndex;
    self.pendingSourceSelectionLineOffset = pendingLineOffset;
    self.string = _markdownSource;
    [self setSelectedRange:NSMakeRange(newCursorLocation, 0)];
    [self forceRender];
    self.applyingSourceMutation = NO;
}

- (void)insertText:(id)insertString {
    NSString *string = nil;
    if ([insertString isKindOfClass:[NSAttributedString class]]) {
        string = [insertString string];
    } else if ([insertString isKindOfClass:[NSString class]]) {
        string = insertString;
    }
    [self applySourceReplacement:string ?: @""];
}

- (NSString *)plainTextFromPasteboard:(NSPasteboard *)pasteboard {
    if (!pasteboard) {
        return nil;
    }

    NSString *string = [pasteboard stringForType:NSPasteboardTypeString];
    if (string.length > 0) {
        return string;
    }

    NSData *rtfData = [pasteboard dataForType:NSPasteboardTypeRTF];
    if (rtfData.length > 0) {
        NSDictionary *attributes = nil;
        NSAttributedString *attributed = [[NSAttributedString alloc] initWithRTF:rtfData documentAttributes:&attributes];
        if (attributed.string.length > 0) {
            return attributed.string;
        }
    }

    NSData *rtfdData = [pasteboard dataForType:NSPasteboardTypeRTFD];
    if (rtfdData.length > 0) {
        NSDictionary *attributes = nil;
        NSAttributedString *attributed = [[NSAttributedString alloc] initWithRTFD:rtfdData documentAttributes:&attributes];
        if (attributed.string.length > 0) {
            return attributed.string;
        }
    }

    return nil;
}

- (void)paste:(id)sender {
    NSPasteboard *pasteboard = nil;
    if ([sender isKindOfClass:[NSPasteboard class]]) {
        pasteboard = (NSPasteboard *)sender;
    } else {
        pasteboard = [NSPasteboard generalPasteboard];
    }

    NSString *string = [self plainTextFromPasteboard:pasteboard];
    if (string.length > 0) {
        [self applySourceReplacement:string];
        return;
    }

    [super paste:sender];
}

- (void)pasteAsPlainText:(id)sender {
    [self paste:sender];
}

- (BOOL)readSelectionFromPasteboard:(NSPasteboard *)pasteboard type:(NSString *)type {
    NSString *string = [self plainTextFromPasteboard:pasteboard];
    if (string.length > 0) {
        [self applySourceReplacement:string];
        return YES;
    }

    return [super readSelectionFromPasteboard:pasteboard type:type];
}

- (void)insertNewline:(id)sender {
    [self applySourceReplacement:@"\n"];
}

- (void)insertLineBreak:(id)sender {
    [self applySourceReplacement:@"\n"];
}

- (void)insertTab:(id)sender {
    [self applySourceReplacement:@"\t"];
}

- (void)deleteBackward:(id)sender {
    NSRange selection = self.selectedRange;
    if (selection.length > 0) {
        [self applySourceReplacement:@""];
        return;
    }

    NSString *source = _markdownSource ?: self.string ?: @"";
    NSUInteger sourceLocation = [self sourceLocationForRenderedSelection:selection];
    if (sourceLocation == 0 || source.length == 0) {
        return;
    }

    NSUInteger deleteLocation = sourceLocation - 1;
    NSMutableString *mutableSource = [source mutableCopy];
    [mutableSource replaceCharactersInRange:NSMakeRange(deleteLocation, 1) withString:@""];
    _markdownSource = [mutableSource copy];

    NSArray<NSString *> *newSourceLines = [_markdownSource componentsSeparatedByString:@"\n"];
    NSUInteger newCursorLocation = MIN(deleteLocation, _markdownSource.length);
    NSUInteger pendingLineIndex = [self lineIndexForLocation:newCursorLocation inLines:newSourceLines];
    NSUInteger pendingLineStart = [self absoluteLocationForLineIndex:pendingLineIndex inLines:newSourceLines];
    NSUInteger pendingLineOffset = newCursorLocation >= pendingLineStart ? newCursorLocation - pendingLineStart : 0;

    self.applyingSourceMutation = YES;
    self.hasPendingSourceSelection = YES;
    self.pendingSourceSelectionLineIndex = pendingLineIndex;
    self.pendingSourceSelectionLineOffset = pendingLineOffset;
    self.string = _markdownSource;
    [self setSelectedRange:NSMakeRange(newCursorLocation, 0)];
    [self forceRender];
    self.applyingSourceMutation = NO;
}

- (void)scheduleRender {
    if (self.renderScheduled) {
        return;
    }

    self.renderScheduled = YES;
    dispatch_async(dispatch_get_main_queue(), ^{
        self.renderScheduled = NO;
        [self forceRender];
    });
}

- (NSInteger)activeLineIndexForCurrentSelection {
    return (NSInteger)[self activeLineRangeForCurrentSelection].location;
}

- (NSRange)activeLineRangeForCurrentSelection {
    NSString *source = self.string ?: @"";
    NSArray<NSString *> *lines = [source componentsSeparatedByString:@"\n"];
    if (lines.count == 0) {
        return NSMakeRange(NSNotFound, 0);
    }

    NSUInteger startLocation = MIN(self.selectedRange.location, source.length);
    NSUInteger endLocation = startLocation;
    if (self.selectedRange.length > 0) {
        endLocation = MIN(NSMaxRange(self.selectedRange), source.length);
        if (endLocation > 0) {
            endLocation -= 1;
        }
    }

    NSUInteger startLineIndex = [self lineIndexForLocation:startLocation inLines:lines];
    NSUInteger endLineIndex = [self lineIndexForLocation:endLocation inLines:lines];
    if (self.selectedRange.length == 0) {
        return NSMakeRange(startLineIndex, 1);
    }

    if (endLineIndex < startLineIndex) {
        endLineIndex = startLineIndex;
    }
    return NSMakeRange(startLineIndex, endLineIndex - startLineIndex + 1);
}

- (void)textDidChange:(NSNotification *)notification {
    if (!self.isRendering) {
        if (self.applyingSourceMutation) {
            return;
        }
        if (!_markdownSource) {
            _markdownSource = [self.string copy];
        }
        [self scheduleRender];
    }
}

- (void)selectionDidChange:(NSNotification *)notification {
    if (!self.isRendering) {
        if (self.applyingSourceMutation) {
            return;
        }
        [self scheduleRender];
    }
}

- (NSUInteger)lineIndexForLocation:(NSUInteger)location inLines:(NSArray<NSString *> *)lines {
    NSUInteger offset = 0;
    for (NSUInteger index = 0; index < lines.count; index++) {
        NSString *line = lines[index] ?: @"";
        NSUInteger lineLength = line.length;
        if (location <= offset + lineLength) {
            return index;
        }
        offset += lineLength + 1;
    }
    return lines.count > 0 ? lines.count - 1 : 0;
}

- (NSUInteger)absoluteLocationForLineIndex:(NSUInteger)lineIndex inLines:(NSArray<NSString *> *)lines {
    NSUInteger offset = 0;
    NSUInteger cappedIndex = MIN(lineIndex, lines.count);
    for (NSUInteger index = 0; index < cappedIndex; index++) {
        offset += [lines[index] length] + 1;
    }
    return offset;
}

- (NSUInteger)absoluteLocationForLineIndex:(NSUInteger)lineIndex
                                lineOffset:(NSUInteger)lineOffset
                                   inLines:(NSArray<NSString *> *)lines {
    NSUInteger lineStart = [self absoluteLocationForLineIndex:lineIndex inLines:lines];
    NSUInteger lineLength = lineIndex < lines.count ? [lines[lineIndex] length] : 0;
    return MIN(lineStart + lineOffset, lineStart + lineLength);
}

- (NSRange)sourceRangeForRenderedSelection:(NSRange)selection {
    NSString *source = _markdownSource ?: self.string ?: @"";
    NSArray<NSString *> *sourceLines = [source componentsSeparatedByString:@"\n"];
    NSUInteger startLocation = [self sourceLocationForRenderedSelection:selection];
    NSUInteger endLocation = NSMaxRange(selection);
    NSUInteger endSourceLocation = startLocation;
    if (selection.length > 0) {
        NSRange endSelection = NSMakeRange(endLocation, 0);
        NSString *currentEndDocument = self.string ?: @"";
        NSArray<NSString *> *currentEndLines = [currentEndDocument componentsSeparatedByString:@"\n"];
        NSUInteger selectedLineIndex = [self lineIndexForLocation:endSelection.location inLines:currentEndLines];
        NSUInteger selectedLineStart = [self absoluteLocationForLineIndex:selectedLineIndex inLines:currentEndLines];
        NSUInteger renderedLineLocation = endSelection.location - selectedLineStart;
        NSArray<NSString *> *sourceEndLines = sourceLines;
        NSString *selectedSourceLine = selectedLineIndex < sourceEndLines.count ? sourceEndLines[selectedLineIndex] : @"";
        NSString *selectedRenderedLine = selectedLineIndex < currentEndLines.count ? currentEndLines[selectedLineIndex] : @"";
        NSUInteger sourceLineStart = [self absoluteLocationForLineIndex:selectedLineIndex inLines:sourceEndLines];
        if ([selectedRenderedLine isEqualToString:selectedSourceLine]) {
            endSourceLocation = sourceLineStart + renderedLineLocation;
        } else {
            endSourceLocation = sourceLineStart + [self.renderer sourceLocationForRenderedLocation:renderedLineLocation
                                                                                       inSourceLine:selectedSourceLine];
        }
    }

    if (endSourceLocation < startLocation) {
        endSourceLocation = startLocation;
    }
    return NSMakeRange(startLocation, endSourceLocation - startLocation);
}

@end
