#import <Cocoa/Cocoa.h>

@interface MarkdownEditor : NSTextView <NSTextViewDelegate>

- (void)setMarkdownSource:(NSString *)markdownSource;
- (void)forceRender;
- (NSUInteger)markdownInsertionIndexForPoint:(NSPoint)point;

@end
