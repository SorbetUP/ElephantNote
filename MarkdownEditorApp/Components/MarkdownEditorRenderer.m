#import "MarkdownEditorRenderer.h"

@interface MarkdownEditorRenderer ()
@end

@implementation MarkdownEditorRenderer

- (NSAttributedString *)renderMarkdown:(NSString *)markdown
                      activeLineIndex:(NSInteger)activeLineIndex {
    if (activeLineIndex < 0) {
        return [self renderMarkdown:markdown activeLineRange:NSMakeRange(NSNotFound, 0)];
    }

    return [self renderMarkdown:markdown activeLineRange:NSMakeRange((NSUInteger)activeLineIndex, 1)];
}

- (NSAttributedString *)renderMarkdown:(NSString *)markdown
                      activeLineRange:(NSRange)activeLineRange {
    NSString *source = markdown ?: @"";
    NSArray<NSString *> *lines = [source componentsSeparatedByString:@"\n"];
    NSMutableAttributedString *result = [[NSMutableAttributedString alloc] init];

    for (NSInteger lineIndex = 0; lineIndex < (NSInteger)lines.count; lineIndex++) {
        if (lineIndex > 0) {
            [result appendAttributedString:[[NSAttributedString alloc] initWithString:@"\n"]];
        }

        NSString *line = lines[(NSUInteger)lineIndex] ?: @"";
        BOOL isActive = NSLocationInRange((NSUInteger)lineIndex, activeLineRange);
        NSAttributedString *renderedLine = [self attributedLineForSourceLine:line active:isActive];
        [result appendAttributedString:renderedLine ?: [[NSAttributedString alloc] initWithString:line]];
    }

    return result;
}

- (NSAttributedString *)attributedLineForSourceLine:(NSString *)line active:(BOOL)isActive {
    NSString *source = line ?: @"";
    NSMutableAttributedString *text = [[NSMutableAttributedString alloc] initWithString:source];
    if (text.length == 0) {
        return text;
    }

    [text setAttributes:@{
        NSFontAttributeName: [NSFont monospacedSystemFontOfSize:16 weight:NSFontWeightRegular],
        NSForegroundColorAttributeName: NSColor.labelColor
    } range:NSMakeRange(0, text.length)];

    if (isActive) {
        [self applyActiveInlineStylesToLine:text source:source];
        [self applyActiveBlockStylesToLine:text source:source];
        return text;
    }

    [self applyInlineStylesToLine:text source:source];
    [self applyBlockStylesToLine:text source:source];
    return text;
}

- (void)applyActiveBlockStylesToLine:(NSMutableAttributedString *)text source:(NSString *)source {
    if (text.length == 0) {
        return;
    }

    NSError *error = nil;

    NSRegularExpression *headerRegex = [NSRegularExpression regularExpressionWithPattern:@"^(#{1,6})\\s+"
                                                                                  options:0
                                                                                    error:&error];
    NSTextCheckingResult *match = [headerRegex firstMatchInString:source options:0 range:NSMakeRange(0, source.length)];
    if (match) {
        NSUInteger level = [match rangeAtIndex:1].length;
        CGFloat fontSize = MAX(16.0, 24.0 - ((CGFloat)level - 1.0) * 2.0);
        NSRange contentRange = NSMakeRange([match rangeAtIndex:0].length, text.length - [match rangeAtIndex:0].length);
        if (contentRange.location < text.length) {
            [text addAttributes:@{
                NSFontAttributeName: [NSFont boldSystemFontOfSize:fontSize],
                NSForegroundColorAttributeName: NSColor.systemBlueColor
            } range:contentRange];
        }
        return;
    }

    NSRegularExpression *unorderedRegex = [NSRegularExpression regularExpressionWithPattern:@"^(\\s*)([-*+])\\s+"
                                                                                     options:0
                                                                                       error:&error];
    match = [unorderedRegex firstMatchInString:source options:0 range:NSMakeRange(0, source.length)];
    if (match) {
        NSRange markerRange = [match rangeAtIndex:0];
        if (markerRange.location < text.length) {
            NSRange contentRange = NSMakeRange(markerRange.location, text.length - markerRange.location);
            [text addAttributes:@{
                NSForegroundColorAttributeName: NSColor.labelColor,
                NSFontAttributeName: [NSFont boldSystemFontOfSize:16]
            } range:contentRange];
        }
        return;
    }

    NSRegularExpression *orderedRegex = [NSRegularExpression regularExpressionWithPattern:@"^(\\s*)(\\d+)([\\.)])\\s+"
                                                                                   options:0
                                                                                     error:&error];
    match = [orderedRegex firstMatchInString:source options:0 range:NSMakeRange(0, source.length)];
    if (match) {
        NSRange markerRange = [match rangeAtIndex:0];
        if (markerRange.location < text.length) {
            NSRange contentRange = NSMakeRange(markerRange.location, text.length - markerRange.location);
            [text addAttributes:@{
                NSForegroundColorAttributeName: NSColor.systemBlueColor,
                NSFontAttributeName: [NSFont boldSystemFontOfSize:16]
            } range:contentRange];
        }
        return;
    }

    NSRegularExpression *quoteRegex = [NSRegularExpression regularExpressionWithPattern:@"^(\\s*>\\s+)"
                                                                                options:0
                                                                                  error:&error];
    match = [quoteRegex firstMatchInString:source options:0 range:NSMakeRange(0, source.length)];
    if (match) {
        [text addAttributes:@{
            NSForegroundColorAttributeName: NSColor.secondaryLabelColor,
            NSBackgroundColorAttributeName: NSColor.controlBackgroundColor,
            NSFontAttributeName: [NSFont fontWithName:@"Georgia-Italic" size:16] ?: [NSFont systemFontOfSize:16]
        } range:NSMakeRange(0, text.length)];
    }
}

- (void)applyBlockStylesToLine:(NSMutableAttributedString *)text source:(NSString *)source {
    if (text.length == 0) {
        return;
    }

    NSString *current = text.string ?: @"";
    NSError *error = nil;
    NSRegularExpression *headerRegex = [NSRegularExpression regularExpressionWithPattern:@"^(#{1,6})\\s+"
                                                                                  options:0
                                                                                    error:&error];
    NSTextCheckingResult *match = [headerRegex firstMatchInString:current options:0 range:NSMakeRange(0, current.length)];
    if (match) {
        NSRange markerRange = [match rangeAtIndex:0];
        NSUInteger level = [match rangeAtIndex:1].length;
        CGFloat fontSize = MAX(16.0, 24.0 - ((CGFloat)level - 1.0) * 2.0);
        [self replaceRange:markerRange inText:text withVisibleText:@"" preserveLength:NO];
        if (markerRange.location < text.length) {
            NSRange contentRange = NSMakeRange(markerRange.location, text.length - markerRange.location);
            [text addAttributes:@{
                NSFontAttributeName: [NSFont boldSystemFontOfSize:fontSize],
                NSForegroundColorAttributeName: NSColor.systemBlueColor
            } range:contentRange];
        }
        return;
    }

    NSRegularExpression *unorderedRegex = [NSRegularExpression regularExpressionWithPattern:@"^(\\s*)([-*+])\\s+"
                                                                                     options:0
                                                                                       error:&error];
    current = text.string ?: @"";
    match = [unorderedRegex firstMatchInString:current options:0 range:NSMakeRange(0, current.length)];
    if (match) {
        NSRange markerRange = [match rangeAtIndex:0];
        [self replaceRange:markerRange inText:text withVisibleText:@"•" preserveLength:NO];
        NSRange contentRange = NSMakeRange(markerRange.location + 1, text.length - (markerRange.location + 1));
        if (contentRange.location < text.length) {
            [text addAttributes:@{
                NSForegroundColorAttributeName: NSColor.labelColor,
                NSFontAttributeName: [NSFont boldSystemFontOfSize:16]
            } range:contentRange];
        }
        return;
    }

    NSRegularExpression *orderedRegex = [NSRegularExpression regularExpressionWithPattern:@"^(\\s*)(\\d+)([\\.)])\\s+"
                                                                                   options:0
                                                                                     error:&error];
    current = text.string ?: @"";
    match = [orderedRegex firstMatchInString:current options:0 range:NSMakeRange(0, current.length)];
    if (match) {
        NSRange markerRange = [match rangeAtIndex:0];
        NSString *number = [current substringWithRange:[match rangeAtIndex:2]];
        NSString *displayMarker = [NSString stringWithFormat:@"%@.", number];
        [self replaceRange:markerRange inText:text withVisibleText:displayMarker preserveLength:NO];
        NSUInteger contentStart = markerRange.location + displayMarker.length;
        NSRange contentRange = NSMakeRange(contentStart, text.length - contentStart);
        if (contentRange.location < text.length) {
            [text addAttributes:@{
                NSForegroundColorAttributeName: NSColor.systemBlueColor,
                NSFontAttributeName: [NSFont boldSystemFontOfSize:16]
            } range:contentRange];
        }
        return;
    }

    NSRegularExpression *quoteRegex = [NSRegularExpression regularExpressionWithPattern:@"^(\\s*>\\s+)"
                                                                                options:0
                                                                                  error:&error];
    current = text.string ?: @"";
    match = [quoteRegex firstMatchInString:current options:0 range:NSMakeRange(0, current.length)];
    if (match) {
        [self replaceRange:[match rangeAtIndex:0] inText:text withVisibleText:@"" preserveLength:NO];
        [text addAttributes:@{
            NSForegroundColorAttributeName: NSColor.secondaryLabelColor,
            NSBackgroundColorAttributeName: NSColor.controlBackgroundColor,
            NSFontAttributeName: [NSFont fontWithName:@"Georgia-Italic" size:16] ?: [NSFont systemFontOfSize:16]
        } range:NSMakeRange(0, text.length)];
    }
}

- (void)applyInlineStylesToLine:(NSMutableAttributedString *)text source:(NSString *)source {
    if (text.length == 0) {
        return;
    }

    NSString *current = text.string ?: @"";
    [self applyPattern:@"`([^`]+?)`"
                  text:text
                source:current
                kind:@"code"];
    current = text.string ?: @"";
    [self applyPattern:@"\\*\\*([^*\\n]+?)\\*\\*"
                  text:text
                source:current
                kind:@"bold"];
    current = text.string ?: @"";
    [self applyPattern:@"(?<!\\*)\\*([^*\\n]+?)\\*(?!\\*)"
                  text:text
                source:current
                kind:@"italic"];
    current = text.string ?: @"";
    [self applyPattern:@"~~([^~\\n]+?)~~"
                  text:text
                source:current
                kind:@"strike"];
    current = text.string ?: @"";
    [self applyPattern:@"==([^=\\n]+?)=="
                  text:text
                source:current
                kind:@"highlight"];
    current = text.string ?: @"";
    [self applyPattern:@"\\+\\+([^+\\n]+?)\\+\\+"
                  text:text
                source:current
                kind:@"underline"];
    current = text.string ?: @"";
    [self applyLinkPattern:text source:current];
}

- (void)applyActiveInlineStylesToLine:(NSMutableAttributedString *)text source:(NSString *)source {
    if (text.length == 0) {
        return;
    }

    NSString *current = source ?: @"";
    [self applyActivePattern:@"`([^`]+?)`" text:text source:current kind:@"code"];
    [self applyActivePattern:@"\\*\\*([^*\\n]+?)\\*\\*" text:text source:current kind:@"bold"];
    [self applyActivePattern:@"(?<!\\*)\\*([^*\\n]+?)\\*(?!\\*)" text:text source:current kind:@"italic"];
    [self applyActivePattern:@"~~([^~\\n]+?)~~" text:text source:current kind:@"strike"];
    [self applyActivePattern:@"==([^=\\n]+?)==" text:text source:current kind:@"highlight"];
    [self applyActivePattern:@"\\+\\+([^+\\n]+?)\\+\\+" text:text source:current kind:@"underline"];
    [self applyActiveLinkPattern:text source:current];
}

- (void)applyActivePattern:(NSString *)pattern
                      text:(NSMutableAttributedString *)text
                    source:(NSString *)source
                      kind:(NSString *)kind {
    NSError *error = nil;
    NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:pattern
                                                                           options:0
                                                                             error:&error];
    if (!regex || error) {
        return;
    }

    NSArray<NSTextCheckingResult *> *matches = [regex matchesInString:source options:0 range:NSMakeRange(0, source.length)];
    for (NSTextCheckingResult *match in [matches reverseObjectEnumerator]) {
        if (match.numberOfRanges < 2) {
            continue;
        }

        NSRange innerRange = [match rangeAtIndex:1];
        if (NSMaxRange(innerRange) > text.length) {
            continue;
        }

        NSDictionary *attributes = nil;
        if ([kind isEqualToString:@"bold"]) {
            attributes = @{
                NSFontAttributeName: [NSFont boldSystemFontOfSize:16],
                NSForegroundColorAttributeName: NSColor.labelColor
            };
        } else if ([kind isEqualToString:@"italic"]) {
            attributes = @{
                NSFontAttributeName: [NSFont fontWithName:@"Georgia-Italic" size:16] ?: [NSFont systemFontOfSize:16],
                NSForegroundColorAttributeName: NSColor.secondaryLabelColor
            };
        } else if ([kind isEqualToString:@"strike"]) {
            attributes = @{
                NSStrikethroughStyleAttributeName: @(NSUnderlineStyleSingle),
                NSForegroundColorAttributeName: NSColor.tertiaryLabelColor
            };
        } else if ([kind isEqualToString:@"highlight"]) {
            attributes = @{
                NSBackgroundColorAttributeName: [NSColor.systemYellowColor colorWithAlphaComponent:0.22],
                NSForegroundColorAttributeName: NSColor.labelColor
            };
        } else if ([kind isEqualToString:@"underline"]) {
            attributes = @{
                NSUnderlineStyleAttributeName: @(NSUnderlineStyleSingle),
                NSForegroundColorAttributeName: NSColor.labelColor
            };
        } else if ([kind isEqualToString:@"code"]) {
            attributes = @{
                NSFontAttributeName: [NSFont monospacedSystemFontOfSize:15 weight:NSFontWeightMedium],
                NSBackgroundColorAttributeName: NSColor.controlBackgroundColor,
                NSForegroundColorAttributeName: NSColor.systemBlueColor
            };
        }

        if (attributes) {
            [text addAttributes:attributes range:innerRange];
        }
    }
}

- (void)applyActiveLinkPattern:(NSMutableAttributedString *)text source:(NSString *)source {
    NSError *error = nil;
    NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:@"\\[([^\\]]+?)\\]\\(([^\\)]+?)\\)"
                                                                           options:0
                                                                             error:&error];
    if (!regex || error) {
        return;
    }

    NSArray<NSTextCheckingResult *> *matches = [regex matchesInString:source options:0 range:NSMakeRange(0, source.length)];
    for (NSTextCheckingResult *match in [matches reverseObjectEnumerator]) {
        if (match.numberOfRanges < 3) {
            continue;
        }

        NSRange titleRange = [match rangeAtIndex:1];
        if (NSMaxRange(titleRange) > text.length) {
            continue;
        }

        NSString *url = [source substringWithRange:[match rangeAtIndex:2]];
        [text addAttributes:@{
            NSForegroundColorAttributeName: NSColor.systemBlueColor,
            NSUnderlineStyleAttributeName: @(NSUnderlineStyleSingle),
            NSLinkAttributeName: url
        } range:titleRange];
    }
}

- (void)applyPattern:(NSString *)pattern
                text:(NSMutableAttributedString *)text
              source:(NSString *)source
                kind:(NSString *)kind {
    NSError *error = nil;
    NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:pattern
                                                                           options:0
                                                                             error:&error];
    if (!regex || error) {
        return;
    }

    NSString *sourceSnapshot = [[text string] copy] ?: @"";
    NSArray<NSTextCheckingResult *> *matches = [regex matchesInString:sourceSnapshot options:0 range:NSMakeRange(0, sourceSnapshot.length)];
    for (NSTextCheckingResult *match in [matches reverseObjectEnumerator]) {
        if (match.numberOfRanges < 2) {
            continue;
        }

        NSRange fullRange = [match rangeAtIndex:0];
        NSRange innerRange = [match rangeAtIndex:1];
        if (NSMaxRange(fullRange) > text.length || NSMaxRange(innerRange) > text.length) {
            continue;
        }

        NSString *innerText = [sourceSnapshot substringWithRange:innerRange];
        [self replaceRange:fullRange inText:text withVisibleText:innerText preserveLength:NO];

        NSDictionary *attributes = nil;
        if ([kind isEqualToString:@"bold"]) {
            attributes = @{
                NSFontAttributeName: [NSFont boldSystemFontOfSize:16],
                NSForegroundColorAttributeName: NSColor.labelColor
            };
        } else if ([kind isEqualToString:@"italic"]) {
            attributes = @{
                NSFontAttributeName: [NSFont fontWithName:@"Georgia-Italic" size:16] ?: [NSFont systemFontOfSize:16],
                NSForegroundColorAttributeName: NSColor.secondaryLabelColor
            };
        } else if ([kind isEqualToString:@"strike"]) {
            attributes = @{
                NSStrikethroughStyleAttributeName: @(NSUnderlineStyleSingle),
                NSForegroundColorAttributeName: NSColor.tertiaryLabelColor
            };
        } else if ([kind isEqualToString:@"highlight"]) {
            attributes = @{
                NSBackgroundColorAttributeName: [NSColor.systemYellowColor colorWithAlphaComponent:0.22],
                NSForegroundColorAttributeName: NSColor.labelColor
            };
        } else if ([kind isEqualToString:@"underline"]) {
            attributes = @{
                NSUnderlineStyleAttributeName: @(NSUnderlineStyleSingle),
                NSForegroundColorAttributeName: NSColor.labelColor
            };
        } else if ([kind isEqualToString:@"code"]) {
            attributes = @{
                NSFontAttributeName: [NSFont monospacedSystemFontOfSize:15 weight:NSFontWeightMedium],
                NSBackgroundColorAttributeName: NSColor.controlBackgroundColor,
                NSForegroundColorAttributeName: NSColor.systemBlueColor
            };
        }

        if (attributes) {
            [text addAttributes:attributes range:NSMakeRange(fullRange.location, innerText.length)];
        }
    }
}

- (void)applyLinkPattern:(NSMutableAttributedString *)text source:(NSString *)source {
    NSError *error = nil;
    NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:@"\\[([^\\]]+?)\\]\\(([^\\)]+?)\\)"
                                                                           options:0
                                                                             error:&error];
    if (!regex || error) {
        return;
    }

    NSString *sourceSnapshot = [[text string] copy] ?: @"";
    NSArray<NSTextCheckingResult *> *matches = [regex matchesInString:sourceSnapshot options:0 range:NSMakeRange(0, sourceSnapshot.length)];
    for (NSTextCheckingResult *match in [matches reverseObjectEnumerator]) {
        if (match.numberOfRanges < 3) {
            continue;
        }

        NSRange fullRange = [match rangeAtIndex:0];
        NSRange titleRange = [match rangeAtIndex:1];
        NSRange urlRange = [match rangeAtIndex:2];
        if (NSMaxRange(fullRange) > text.length || NSMaxRange(titleRange) > text.length || NSMaxRange(urlRange) > sourceSnapshot.length) {
            continue;
        }

        NSString *title = [sourceSnapshot substringWithRange:titleRange];
        [self replaceRange:fullRange inText:text withVisibleText:title preserveLength:NO];

        [text addAttributes:@{
            NSForegroundColorAttributeName: NSColor.systemBlueColor,
            NSUnderlineStyleAttributeName: @(NSUnderlineStyleSingle),
            NSLinkAttributeName: [sourceSnapshot substringWithRange:urlRange]
        } range:NSMakeRange(fullRange.location, title.length)];
    }
}

- (void)replaceRange:(NSRange)range inText:(NSMutableAttributedString *)text withVisibleText:(NSString *)visibleText preserveLength:(BOOL)preserveLength {
    if (range.location == NSNotFound || range.length == 0 || NSMaxRange(range) > text.length) {
        return;
    }

    NSString *replacement = visibleText ?: @"";
    [text replaceCharactersInRange:range withString:replacement];
}

- (NSUInteger)removedCharactersBeforeSourceOffset:(NSUInteger)offset inSourceLine:(NSString *)sourceLine {
    NSString *source = sourceLine ?: @"";
    NSUInteger clampedOffset = MIN(offset, source.length);
    NSUInteger removed = 0;

    NSError *error = nil;
    NSRegularExpression *headerRegex = [NSRegularExpression regularExpressionWithPattern:@"^(#{1,6})\\s+"
                                                                                  options:0
                                                                                    error:&error];
    NSTextCheckingResult *match = [headerRegex firstMatchInString:source options:0 range:NSMakeRange(0, source.length)];
    if (match && NSMaxRange([match rangeAtIndex:0]) <= clampedOffset) {
        removed += [match rangeAtIndex:0].length;
    }

    NSRegularExpression *unorderedRegex = [NSRegularExpression regularExpressionWithPattern:@"^(\\s*)([-*+])\\s+"
                                                                                     options:0
                                                                                       error:&error];
    match = [unorderedRegex firstMatchInString:source options:0 range:NSMakeRange(0, source.length)];
    if (match && NSMaxRange([match rangeAtIndex:0]) <= clampedOffset) {
        removed += [match rangeAtIndex:0].length - 1;
    }

    NSRegularExpression *orderedRegex = [NSRegularExpression regularExpressionWithPattern:@"^(\\s*)(\\d+)([\\.)])\\s+"
                                                                                   options:0
                                                                                     error:&error];
    match = [orderedRegex firstMatchInString:source options:0 range:NSMakeRange(0, source.length)];
    if (match && NSMaxRange([match rangeAtIndex:0]) <= clampedOffset) {
        NSString *number = [source substringWithRange:[match rangeAtIndex:2]];
        NSUInteger displayLength = number.length + 1;
        removed += [match rangeAtIndex:0].length - displayLength;
    }

    NSRegularExpression *quoteRegex = [NSRegularExpression regularExpressionWithPattern:@"^(\\s*>\\s+)"
                                                                                options:0
                                                                                  error:&error];
    match = [quoteRegex firstMatchInString:source options:0 range:NSMakeRange(0, source.length)];
    if (match && NSMaxRange([match rangeAtIndex:0]) <= clampedOffset) {
        removed += [match rangeAtIndex:0].length;
    }

    NSArray<NSDictionary *> *patterns = @[
        @{@"regex": @"`([^`]+?)`"},
        @{@"regex": @"\\*\\*([^*\\n]+?)\\*\\*"},
        @{@"regex": @"(?<!\\*)\\*([^*\\n]+?)\\*(?!\\*)"},
        @{@"regex": @"~~([^~\\n]+?)~~"},
        @{@"regex": @"==([^=\\n]+?)=="},
        @{@"regex": @"\\+\\+([^+\\n]+?)\\+\\+"},
        @{@"regex": @"\\[([^\\]]+?)\\]\\(([^\\)]+?)\\)"}
    ];

    for (NSDictionary *entry in patterns) {
        NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:entry[@"regex"]
                                                                               options:0
                                                                                 error:&error];
        if (!regex || error) {
            continue;
        }
        for (NSTextCheckingResult *result in [regex matchesInString:source options:0 range:NSMakeRange(0, source.length)]) {
            if (result.numberOfRanges < 2) {
                continue;
            }
            NSRange fullRange = [result rangeAtIndex:0];
            NSRange innerRange = [result rangeAtIndex:1];
            NSUInteger visibleLength = innerRange.length;
            if ([entry[@"regex"] isEqualToString:@"\\[([^\\]]+?)\\]\\(([^\\)]+?)\\)"]) {
                visibleLength = [result rangeAtIndex:1].length;
            }

            if (NSMaxRange(fullRange) <= clampedOffset) {
                removed += fullRange.length - visibleLength;
            }
        }
    }

    return removed;
}

- (void)replaceRange:(NSRange)range
            inString:(NSMutableString *)string
           sourceMap:(NSMutableArray<NSNumber *> *)sourceMap
     withVisibleText:(NSString *)visibleText
        sourceIndices:(NSArray<NSNumber *> *)sourceIndices {
    if (range.location == NSNotFound || NSMaxRange(range) > string.length || NSMaxRange(range) > sourceMap.count) {
        return;
    }

    NSString *replacement = visibleText ?: @"";
    NSArray<NSNumber *> *indices = sourceIndices ?: @[];
    NSMutableArray<NSNumber *> *mappedIndices = [NSMutableArray arrayWithCapacity:replacement.length];

    for (NSUInteger index = 0; index < replacement.length; index++) {
        NSUInteger sourceIndex = range.location;
        if (index < indices.count) {
            sourceIndex = indices[index].unsignedIntegerValue;
        } else if (indices.count > 0) {
            sourceIndex = indices.lastObject.unsignedIntegerValue;
        }
        [mappedIndices addObject:@(sourceIndex)];
    }

    [string replaceCharactersInRange:range withString:replacement];
    [sourceMap replaceObjectsInRange:range withObjectsFromArray:mappedIndices];
}

- (NSUInteger)sourceIndexForCurrentIndex:(NSUInteger)currentIndex
                               sourceMap:(NSArray<NSNumber *> *)sourceMap {
    if (sourceMap.count == 0) {
        return currentIndex;
    }
    if (currentIndex >= sourceMap.count) {
        return sourceMap.lastObject.unsignedIntegerValue;
    }
    return sourceMap[currentIndex].unsignedIntegerValue;
}

- (NSArray<NSNumber *> *)sourceIndexMapForSourceLine:(NSString *)sourceLine {
    NSString *source = sourceLine ?: @"";
    NSMutableString *rendered = [source mutableCopy];
    NSMutableArray<NSNumber *> *sourceMap = [NSMutableArray arrayWithCapacity:source.length];
    for (NSUInteger index = 0; index < source.length; index++) {
        [sourceMap addObject:@(index)];
    }

    NSError *error = nil;
    NSString *current = [rendered copy];

    NSRegularExpression *headerRegex = [NSRegularExpression regularExpressionWithPattern:@"^(#{1,6})\\s+"
                                                                                  options:0
                                                                                    error:&error];
    NSTextCheckingResult *match = [headerRegex firstMatchInString:current options:0 range:NSMakeRange(0, current.length)];
    if (match) {
        [self replaceRange:[match rangeAtIndex:0]
                  inString:rendered
                 sourceMap:sourceMap
           withVisibleText:@""
              sourceIndices:@[]];
    }

    NSRegularExpression *unorderedRegex = [NSRegularExpression regularExpressionWithPattern:@"^(\\s*)([-*+])\\s+"
                                                                                     options:0
                                                                                       error:&error];
    current = [rendered copy];
    match = [unorderedRegex firstMatchInString:current options:0 range:NSMakeRange(0, current.length)];
        if (match) {
            NSRange markerRange = [match rangeAtIndex:0];
        NSUInteger sourceIndex = [self sourceIndexForCurrentIndex:NSMaxRange(markerRange)
                                                        sourceMap:sourceMap];
        [self replaceRange:markerRange
                  inString:rendered
                 sourceMap:sourceMap
           withVisibleText:@"•"
              sourceIndices:@[@(sourceIndex)]];
    }

    NSRegularExpression *orderedRegex = [NSRegularExpression regularExpressionWithPattern:@"^(\\s*)(\\d+)([\\.)])\\s+"
                                                                                   options:0
                                                                                     error:&error];
    current = [rendered copy];
    match = [orderedRegex firstMatchInString:current options:0 range:NSMakeRange(0, current.length)];
    if (match) {
        NSRange markerRange = [match rangeAtIndex:0];
        NSString *number = [current substringWithRange:[match rangeAtIndex:2]];
        NSRange numberRange = [match rangeAtIndex:2];
        NSRange delimiterRange = [match rangeAtIndex:3];
        NSMutableArray<NSNumber *> *indices = [NSMutableArray arrayWithCapacity:number.length + 1];
        for (NSUInteger i = 0; i < number.length; i++) {
            [indices addObject:@([self sourceIndexForCurrentIndex:numberRange.location + i sourceMap:sourceMap])];
        }
        [indices addObject:@([self sourceIndexForCurrentIndex:delimiterRange.location sourceMap:sourceMap])];
        NSString *displayMarker = [NSString stringWithFormat:@"%@.", number];
        [self replaceRange:markerRange
                  inString:rendered
                 sourceMap:sourceMap
           withVisibleText:displayMarker
              sourceIndices:indices];
    }

    NSRegularExpression *quoteRegex = [NSRegularExpression regularExpressionWithPattern:@"^(\\s*>\\s+)"
                                                                                options:0
                                                                                  error:&error];
    current = [rendered copy];
    match = [quoteRegex firstMatchInString:current options:0 range:NSMakeRange(0, current.length)];
    if (match) {
        [self replaceRange:[match rangeAtIndex:0]
                  inString:rendered
                 sourceMap:sourceMap
           withVisibleText:@""
              sourceIndices:@[]];
    }

    NSArray<NSDictionary *> *patterns = @[
        @{@"regex": @"`([^`]+?)`"},
        @{@"regex": @"\\*\\*([^*\\n]+?)\\*\\*"},
        @{@"regex": @"(?<!\\*)\\*([^*\\n]+?)\\*(?!\\*)"},
        @{@"regex": @"~~([^~\\n]+?)~~"},
        @{@"regex": @"==([^=\\n]+?)=="},
        @{@"regex": @"\\+\\+([^+\\n]+?)\\+\\+"},
        @{@"regex": @"\\[([^\\]]+?)\\]\\(([^\\)]+?)\\)"}
    ];

    for (NSDictionary *entry in patterns) {
        NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:entry[@"regex"]
                                                                               options:0
                                                                                 error:&error];
        if (!regex || error) {
            continue;
        }
        current = [rendered copy];
        NSArray<NSTextCheckingResult *> *matches = [regex matchesInString:current options:0 range:NSMakeRange(0, current.length)];
        for (NSTextCheckingResult *result in [matches reverseObjectEnumerator]) {
            if (result.numberOfRanges < 2) {
                continue;
            }

            NSRange fullRange = [result rangeAtIndex:0];
            NSRange innerRange = [result rangeAtIndex:1];
            NSString *visibleText = [current substringWithRange:innerRange];
            NSMutableArray<NSNumber *> *indices = [NSMutableArray arrayWithCapacity:visibleText.length];

            if ([entry[@"regex"] isEqualToString:@"\\[([^\\]]+?)\\]\\(([^\\)]+?)\\)"]) {
                NSRange titleRange = [result rangeAtIndex:1];
                visibleText = [current substringWithRange:titleRange];
                for (NSUInteger i = 0; i < visibleText.length; i++) {
                    [indices addObject:@([self sourceIndexForCurrentIndex:titleRange.location + i sourceMap:sourceMap])];
                }
            } else {
                for (NSUInteger i = 0; i < visibleText.length; i++) {
                    [indices addObject:@([self sourceIndexForCurrentIndex:innerRange.location + i sourceMap:sourceMap])];
                }
            }

            [self replaceRange:fullRange
                      inString:rendered
                     sourceMap:sourceMap
               withVisibleText:visibleText
                  sourceIndices:indices];
        }
    }

    return [sourceMap copy];
}

- (NSUInteger)sourceLocationForRenderedLocation:(NSUInteger)renderedLocation
                                   inSourceLine:(NSString *)sourceLine {
    NSString *source = sourceLine ?: @"";
    if (source.length == 0) {
        return 0;
    }

    NSArray<NSNumber *> *sourceMap = [self sourceIndexMapForSourceLine:source];
    if (sourceMap.count == 0) {
        return 0;
    }

    NSUInteger clampedLocation = MIN(renderedLocation, sourceMap.count);
    if (clampedLocation >= sourceMap.count) {
        return source.length;
    }
    return sourceMap[clampedLocation].unsignedIntegerValue;
}

@end
