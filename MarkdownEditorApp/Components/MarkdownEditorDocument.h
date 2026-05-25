#import <Foundation/Foundation.h>

@interface MarkdownEditorDocument : NSObject

@property (copy, nonatomic) NSString *filePath;
@property (copy, nonatomic) NSString *content;
@property (assign, nonatomic) BOOL dirty;
@property (strong, nonatomic) NSMutableArray<NSString *> *lineContents;
@property (assign, nonatomic) NSInteger currentLineIndex;

- (void)replaceContent:(NSString *)content filePath:(NSString *)filePath dirty:(BOOL)dirty;
- (void)updateLineContentsFromContent:(NSString *)content;
- (BOOL)updateCursorLineIndexForContent:(NSString *)content cursorLocation:(NSUInteger)cursorLocation;
- (void)markSaved;
- (void)markDirty;
- (NSString *)displayName;

@end
