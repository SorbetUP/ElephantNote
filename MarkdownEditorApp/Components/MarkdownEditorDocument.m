#import "MarkdownEditorDocument.h"

@implementation MarkdownEditorDocument

- (instancetype)init {
    self = [super init];
    if (self) {
        _lineContents = [[NSMutableArray alloc] init];
        _currentLineIndex = 0;
    }
    return self;
}

- (void)replaceContent:(NSString *)content filePath:(NSString *)filePath dirty:(BOOL)dirty {
    self.content = [content copy] ?: @"";
    self.filePath = [filePath copy];
    self.dirty = dirty;
    [self updateLineContentsFromContent:self.content];
    self.currentLineIndex = 0;
}

- (void)updateLineContentsFromContent:(NSString *)content {
    NSString *resolvedContent = content ?: @"";
    NSArray<NSString *> *lines = [resolvedContent componentsSeparatedByString:@"\n"];
    [self.lineContents removeAllObjects];
    [self.lineContents addObjectsFromArray:lines];
}

- (BOOL)updateCursorLineIndexForContent:(NSString *)content cursorLocation:(NSUInteger)cursorLocation {
    NSString *resolvedContent = content ?: @"";
    NSUInteger clampedLocation = MIN(cursorLocation, resolvedContent.length);
    NSInteger previousLineIndex = self.currentLineIndex;
    NSString *textUpToCursor = [resolvedContent substringToIndex:clampedLocation];
    self.currentLineIndex = [[textUpToCursor componentsSeparatedByString:@"\n"] count] - 1;
    return previousLineIndex != self.currentLineIndex;
}

- (void)markSaved {
    self.dirty = NO;
}

- (void)markDirty {
    self.dirty = YES;
}

- (NSString *)displayName {
    if (self.filePath.length > 0) {
        return self.filePath.lastPathComponent;
    }
    return @"Sans titre";
}

@end
