#import <Cocoa/Cocoa.h>

@interface MarkdownEditorRenderer : NSObject

- (NSAttributedString *)renderMarkdown:(NSString *)markdown
                      activeLineIndex:(NSInteger)activeLineIndex;

- (NSAttributedString *)renderMarkdown:(NSString *)markdown
                      activeLineRange:(NSRange)activeLineRange;

- (NSUInteger)sourceLocationForRenderedLocation:(NSUInteger)renderedLocation
                                   inSourceLine:(NSString *)sourceLine;

@end
