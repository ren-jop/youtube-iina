import { resolveSearchVideoPresentation } from "../src/ui/controller/feedPresentation";
import { expect, test } from "bun:test";
import { chatRenderer, continuation, initialCommentToken, parseChat, parseComments } from "../src/ui/parsers/discussion";
import { filterReason } from "../src/ui/storage/feedFilters";
import { defaultOptions, normalizeOptions } from "../src/ui/storage/libraryData";
const token = (value:string) => ({continuationItemRenderer:{continuationEndpoint:{continuationCommand:{token:value}}}});
test("comments initialization scopes its token away from recommendations and chat", () => {
 const data = {related:token("wrong"),liveChatRenderer:{continuations:[{reloadContinuationData:{continuation:"chat"}}]},contents:[{itemSectionRenderer:{targetId:"comments-section",contents:[token("comments")]}}]};
 expect(initialCommentToken(data)).toBe("comments");
 expect(continuation(chatRenderer(data)?.continuations)).toBe("chat");
 expect(initialCommentToken({related:token("wrong")})).toBe("");
});
test("parses legacy and modern comments and never chooses a reply continuation", () => {
 const data = {onResponseReceivedEndpoints:[{reloadContinuationItemsCommand:{targetId:"comments-section",continuationItems:[{commentThreadRenderer:{comment:{commentRenderer:{commentId:"old",authorText:{simpleText:"Author"},contentText:{runs:[{text:"`${danger}<script>"}]} }},replies:{contents:[token("reply")]}}},token("next")]}}],frameworkUpdates:{entityBatchUpdate:{mutations:[{payload:{commentEntityPayload:{properties:{commentId:"modern",content:{content:"日本語"},publishedTime:"today"},author:{displayName:"名前"},toolbar:{likeCountNotliked:"2"}}}}]}}};
 const parsed = parseComments(data);
 expect(parsed.entries.map(e=>e.author).sort()).toEqual(["Author","名前"].sort());
 expect(parsed.entries.find(e=>e.id==="old")?.text).toBe("`${danger}<script>"); expect(parsed.next).toBe("next");
});
test("chat supports paid messages, emojis, replacement and moderation, with bounded polling", () => {
 const page = parseChat({continuationContents:{liveChatContinuation:{continuations:[{timedContinuationData:{continuation:"next",timeoutMs:1}}],actions:[{addChatItemAction:{item:{liveChatPaidMessageRenderer:{id:"one",authorName:{simpleText:"Viewer"},authorExternalChannelId:"channel",message:{runs:[{text:"Hello "},{emoji:{shortcuts:[":wave:"]}}]},purchaseAmountText:{simpleText:"$5"}}}}},{removeChatItemAction:{targetItemId:"old"}},{markChatItemsByAuthorAsDeletedAction:{externalChannelId:"banned"}},{replaceChatItemAction:{targetItemId:"replaced",replacementItem:{liveChatTextMessageRenderer:{id:"new",message:{simpleText:"Updated"}}}}}]}}});
 expect(page.entries[0]).toMatchObject({text:"Hello :wave:",meta:"$5",channelId:"channel"});
 expect(page.deleted).toEqual(["old","replaced"]); expect(page.deletedAuthors).toEqual(["banned"]); expect(page.delay).toBe(2000); expect(page.next).toBe("next");
});
test("local quality rules are optional and do not judge unknown durations or popularity", () => {
 const video={title:"YOU WON'T BELIEVE THIS!!!",channelTitle:"Example",durationLabel:"1:30"};
 expect(filterReason(video, defaultOptions)).toBe("");
 expect(filterReason(video,{...defaultOptions,qualityFilter:true})).toBe("Clickbait title");
 expect(filterReason({...video,title:"A small channel's careful explanation",durationLabel:""},{...defaultOptions,minimumMinutes:10})).toBe("");
 expect(filterReason(video,{...defaultOptions,minimumMinutes:3})).toBe("Below minimum length");
 expect(filterReason(video,{...defaultOptions,hiddenChannels:[" example "]})).toBe("Hidden channel");
 expect(filterReason({...video,title:"数学の解説"},{...defaultOptions,excludedWords:["数学"]})).toBe("Excluded title phrase");
});
test("new appearance and discovery settings validate old and imported backups", () => {
 expect(normalizeOptions({theme:"bad",opacity:-1,hiddenChannels:["a",null,"a"],minimumMinutes:500})).toMatchObject({opacity:90,hiddenChannels:["a"],minimumMinutes:0,japaneseMode:false});
 expect(normalizeOptions({...defaultOptions,theme:"wireframe",japaneseMode:true,opacity:60})).toMatchObject({japaneseMode:true,opacity:60});
 expect(normalizeOptions({theme:"wireframe",showStats:false,playbackQuality:"auto"})).toMatchObject({showStats:true,playbackQuality:"1080"});
 expect(normalizeOptions({theme:"wireframe"})).not.toHaveProperty("theme");
});

test("strict Japanese discovery excludes English, Chinese and ambiguous titles", async () => {
 const { isJapaneseTitle, parseJapaneseTranslation } = await import("../src/ui/innertube/japanese");
 expect(isJapaneseTitle("ギターを練習する方法")).toBe(true);
 for (const title of ["Learn guitar", "学习吉他的方法", "数学", "Learn guitar easily 日本語"]) expect(isJapaneseTitle(title)).toBe(false);
 expect(filterReason({title:"Learn guitar",channelTitle:"Channel"},{...defaultOptions,japaneseMode:true})).toBe("Not a Japanese title");
 expect(parseJapaneseTranslation({responseStatus:200,responseData:{translatedText:"ギターの練習"}})).toBe("ギターの練習");
 expect(()=>parseJapaneseTranslation({responseStatus:429,responseData:{translatedText:"quota exceeded"}})).toThrow();
});

test("academic mode excludes obvious entertainment but keeps useful and uncertain topics", () => {
 const options={...defaultOptions,academicMode:true};
 for(const title of ["Minecraft survival day 2","Fortnite gameplay","Official music video","Match highlights","Prank compilation"])
   expect(filterReason({title,channelTitle:"Channel"},options)).toBe("Academic focus");
 for(const title of ["Minecraft as an educational tool: research","Game theory lecture","Chemical reaction tutorial","Sports science explained","Guitar lesson","Economics","Interview with a researcher","An unusual idea"])
   expect(filterReason({title,channelTitle:"Channel"},options)).toBe("");
 const both={...options,japaneseMode:true};
 expect(filterReason({title:"科学の解説",channelTitle:"Channel"},both)).toBe("");
 expect(filterReason({title:"マイクラでゲーム実況",channelTitle:"Channel"},both)).toBe("Academic focus");
 expect(filterReason({title:"Science explained",channelTitle:"Channel"},both)).toBe("Not a Japanese title");
});

test("search and modern Japanese cards preserve views and publication labels", async () => {
 const { parseSearchResponse }=await import("../src/ui/parsers/search");
 const { resolveSearchVideoPresentation, resolveFeedItemPresentation }=await import("../src/ui/controller/feedPresentation");
 const { readLockupMetadata }=await import("../src/ui/parsers/lockupMetadata");
 const parsed=parseSearchResponse({videoRenderer:{videoId:"abcdefghijk",title:{simpleText:"学びの動画"},viewCountText:{simpleText:"1.2万回視聴"},publishedTimeText:{simpleText:"2日前"}}}).videos[0];
 expect(resolveSearchVideoPresentation(parsed,null).statsLine).toBe("1.2万回視聴 • 2日前");
 const metadata=readLockupMetadata({metadata:{contentMetadataViewModel:{metadataRows:[{metadataParts:[{text:{content:"1.2万回視聴"}},{text:{content:"2日前"}}]}]}}});
 expect(metadata).toEqual({channel:"",views:"1.2万回視聴",published:"2日前"});
 expect(resolveFeedItemPresentation({videoId:"abcdefghijk",title:"動画",channelTitle:"",thumbnailUrl:"",published:metadata.published,viewCountText:metadata.views},null).statsLine).toBe("1.2万回視聴 • 2日前");
});


test("video metadata preserves supplied publication dates without inventing dates from view counts", () => {
 const video = {videoId:"abcdefghijk",title:"Lecture",channelTitle:"Teacher",thumbnailUrl:"",viewCountText:"12K views",publishedText:"2026-09-15T00:00:00Z"};
 expect(resolveSearchVideoPresentation(video,null).statsLine).toBe(`12K views • ${new Date(video.publishedText).toLocaleDateString()}`);
 expect(resolveSearchVideoPresentation({...video,publishedText:"12K views"},null).statsLine).toBe("12K views");
 expect(resolveSearchVideoPresentation({...video,publishedText:""},null).statsLine).toBe("12K views");
});
