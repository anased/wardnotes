# Changelog

All notable changes to the WardNotes web application will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added - Freemium Pricing with Monthly Usage Quotas (December 2025)

#### Overview
Implemented a soft paywall freemium pricing model that allows free users to try AI-powered features with monthly usage quotas (3 flashcard generations, 2 note improvements per month), while premium users retain unlimited access.

#### Problem Statement
The hard paywall prevented free users from experiencing AI features, limiting conversion opportunities. Users couldn't trial premium features before purchasing, resulting in:
- Low conversion rates (users hesitant to pay without trying)
- High API costs supporting unlimited trial users
- No mechanism to demonstrate value proposition
- Limited product-led growth potential

#### Solution Implemented

##### 1. Backend Infrastructure (Already Complete)
**Database Migration:** `src/lib/supabase/migrations/add_usage_quotas.sql`

**New Tables:**
- `usage_quotas` - Tracks monthly usage limits and consumption per user
  - Columns: flashcard_generations_used/limit, note_improvements_used/limit
  - Period tracking: period_start, period_end
  - Null limits indicate unlimited (premium users)
- `api_usage_logs` - Analytics tracking for API costs (optional)

**Database Functions:**
- `initialize_user_quota(p_user_id)` - Creates quota for new users based on subscription
- `check_and_increment_usage(p_user_id, p_feature_type)` - Validates and increments usage atomically
- `reset_monthly_quotas()` - Resets quotas on the 1st of each month (cron job)
- `get_user_quota(p_user_id)` - Retrieves formatted quota information

**Backend Service:** `src/lib/services/quotaService.ts`
- Functions: checkAndIncrementQuota, getUserQuota, getFormattedQuota, canUseFeature, logApiUsage

**API Routes:**
- `GET /api/user/quota` - Returns current quota state for authenticated user
- Updated `/api/flashcards/generate-from-note` - Checks quota before AI generation
- Updated `/api/improve-note` - Checks quota before AI improvement

##### 2. Frontend Components

**New Hook:** `src/lib/hooks/useQuota.ts`
```typescript
interface UseQuotaReturn {
  quota: QuotaState | null;
  loading: boolean;
  error: Error | null;
  refreshQuota: () => Promise<void>;
  canUseFeature: (featureType: QuotaFeatureType) => boolean;
  getRemainingUses: (featureType: QuotaFeatureType) => number | null;
}
```

**Key Features:**
- Centralized quota data fetching from `/api/user/quota`
- Auto-skips fetch for premium users (they have unlimited)
- Fail-open approach (allows usage if quota fetch fails)
- Provides helper functions for quota checking

**New Component:** `src/components/premium/InlineQuotaIndicator.tsx`
- Displays "(X/Y left)" badges next to feature buttons
- Color-coded: green (>1 remaining), yellow (1 remaining), red (0 remaining)
- Auto-hides for premium users
- Dark mode support

**Modified Component:** `src/components/premium/PremiumFeatureGate.tsx`

**Before (Hard Paywall):**
```typescript
if (isPremium) {
  return <>{children}</>;
}
// Always block free users
```

**After (Soft Paywall):**
```typescript
// 1. Premium users: full access
if (isPremium) {
  return <>{children}</>;
}

// 2. Free users with quota available: allow access (NEW)
if (featureType && quota && canUseFeature(featureType)) {
  return <>{children}</>;
}

// 3. Free users without quota: show upgrade modal
```

**New Props:**
- `featureType?: QuotaFeatureType` - Enables quota checking
- `onQuotaExhausted?: () => void` - Callback when quota reached

**Upgrade Modal Enhancement:**
- Shows quota-specific messaging: "You've used X/Y free uses this month. Resets in N days."
- Tracks analytics: `quota_limit_reached` event

##### 3. Component Integration

**FlashcardIntegrationButton** (`src/components/notes/FlashcardIntegrationButton.tsx`):
- Added `featureType="flashcard_generation"` to PremiumFeatureGate
- Shows inline quota indicator for free users
- Handles 429 (quota exceeded) errors with user-friendly messages
- Refreshes quota after successful generation

**NoteImprover** (`src/components/notes/NoteImprover.tsx`):
- Added `featureType="note_improvement"` to PremiumFeatureGate
- Shows inline quota indicator for free users
- Handles 429 errors gracefully
- Refreshes quota after successful improvement

**EnhancedFlashcardGeneratorModal** (`src/components/notes/EnhancedFlashcardGeneratorModal.tsx`):
- Added optional `onSuccess?: () => void` callback prop
- Handles 429 errors: "Monthly flashcard generation limit reached. Upgrade to Premium for unlimited access."
- Calls `onSuccess()` callback after successful save to refresh quota

**Dashboard** (`src/app/dashboard/page.tsx`):
- Added QuotaDisplay component below welcome section
- Only visible to free users
- Shows at-a-glance quota status and upgrade link

**Subscription Settings** (`src/app/settings/subscription/page.tsx`):
- Added QuotaDisplay in free user section
- Shows current usage before feature list
- Contextualizes upgrade value proposition

##### 4. Analytics Events

**New Event:** `quota_limit_reached`
```typescript
interface QuotaLimitReachedProperties {
  feature_type: 'flashcard_generation' | 'note_improvement';
  days_until_reset?: number;
  subscription_status: string;
}
```

**Tracked When:**
- User with exhausted quota clicks on gated feature
- Provides data for conversion funnel analysis

#### User Experience Flow

**Free User Journey:**
1. See quota indicators on Dashboard and Settings pages
2. See "(2/3 left)" badge next to "Generate Flashcards" button
3. Click button → Modal opens (quota available)
4. Generate flashcards → Quota decrements to "(1/3 left)"
5. Hit limit → Upgrade modal appears with: "Used 3/3 free uses this month. Resets in 15 days."
6. Click "Upgrade to Premium" → Stripe checkout

**Premium User Journey:**
- No quota indicators shown (unlimited access)
- No changes to existing experience
- All features work identically

#### Cost Analysis

**Free Tier Quotas:**
- 3 AI flashcard generations per month
- 2 AI note improvements per month

**Cost Per Free User Per Month:**
- (3 × $0.02) + (2 × $0.008) = **$0.076 per user/month**

**Break-Even Point:**
- Need only 76 premium conversions per 10,000 free users = **0.76% conversion rate**
- Industry standard: 2-5%
- **Conclusion:** ROI positive even with pessimistic assumptions

#### Files Modified/Created

**Created:**
- `src/lib/hooks/useQuota.ts` - Quota management hook
- `src/components/premium/InlineQuotaIndicator.tsx` - Quota badge component

**Modified:**
- `src/components/premium/PremiumFeatureGate.tsx` - Added soft paywall support
- `src/components/notes/FlashcardIntegrationButton.tsx` - Added quota indicator
- `src/components/notes/EnhancedFlashcardGeneratorModal.tsx` - Added onSuccess callback, 429 handling
- `src/components/notes/NoteImprover.tsx` - Added quota indicator, 429 handling
- `src/app/dashboard/page.tsx` - Added QuotaDisplay component
- `src/app/settings/subscription/page.tsx` - Added QuotaDisplay component
- `src/types/analytics.ts` - Added quota-related event types

#### Technical Details

**Quota Checking Flow:**
1. User clicks feature button
2. PremiumFeatureGate checks: isPremium? → Allow
3. If not premium: canUseFeature(featureType)? → Allow
4. If quota exhausted → Show upgrade modal
5. API endpoint performs server-side quota check (double validation)
6. Returns 429 if quota exceeded
7. Frontend handles 429 with user-friendly error message

**Data Flow:**
- Frontend: useQuota hook fetches quota on mount → cached in state
- User action: refreshQuota() called after successful operation
- Backend: check_and_increment_usage() atomically validates and increments
- Monthly reset: Cron job calls reset_monthly_quotas() on 1st of month

**Security:**
- Row-level security (RLS) on usage_quotas table
- Users can only view their own quotas
- Server-side validation prevents quota bypass
- Atomic increment prevents race conditions

#### Backward Compatibility

**Preserved Behavior:**
- PremiumFeatureGate without `featureType` prop → Hard paywall (existing behavior)
- Premium users → No changes, unlimited access
- API routes → Existing functionality unchanged

**Rollback Plan:**
- Remove `featureType` prop from PremiumFeatureGate calls → reverts to hard paywall
- Quota tracking continues in backend (no data loss)

#### Success Metrics

**Primary KPIs:**
- Conversion Rate: Free → Premium (Target: 2-5%)
- API Cost per Free User: Should stay ≤ $0.08/month
- Net Revenue: Should increase ≥50% within 3 months

**Secondary KPIs:**
- Free User Activation Rate: % who use ≥1 AI feature
- Quota Exhaustion Rate: % hitting monthly limit
- Time to First Premium Conversion: Days from signup

---

### Added - Note-Based Flashcard Section (December 2025)

#### Overview
Implementation of "flashcards from this note" section on web app note detail pages, providing feature parity with the mobile app's flashcard display functionality while maintaining web-optimized UX patterns.

#### Problem Statement
The web app lacked a way to view flashcards in the context of the note they were generated from. Users had to:
- Navigate away from notes to the flashcard dashboard to see related flashcards
- Manually remember which flashcards came from which notes
- Open the flashcard generator to see if flashcards existed for a note

The mobile app already had a "flashcards from this note" section that displayed:
- Statistics showing due/new/learning card counts
- Preview of the first 5 cards
- Quick actions to study or manage flashcards
- Empty state when no flashcards existed

This feature needed to be adapted for the web app with a horizontal/compact layout optimized for desktop and larger screens.

#### Solution Implemented

##### 1. New Component: NoteFlashcardsSection
**File:** `src/components/notes/NoteFlashcardsSection.tsx` (350 lines)

**Purpose:** Display flashcard information and actions for a specific note

**Props Interface:**
```typescript
interface NoteFlashcardsSectionProps {
  noteId: string;
  noteTitle: string;
}
```

**State Management:**
```typescript
- flashcards: Flashcard[] - All flashcards for this note
- loading: boolean - Data fetch state
- error: string | null - Error messages
- stats: { total, due, new, learning } - Calculated statistics
- showStudyModal: boolean - Study session modal visibility
- showListModal: boolean - Management modal visibility
```

**Key Features:**

1. **Data Fetching:**
   - Uses `FlashcardService.getFlashcards({ note_id: noteId })` on mount
   - Filters flashcards to only those with matching `note_id`
   - Auto-refreshes after study sessions or card edits

2. **Statistics Calculation (Client-Side):**
   ```typescript
   const now = new Date();
   const stats = {
     total: cards.length,
     due: cards.filter(card =>
       new Date(card.next_review) <= now && card.status !== 'suspended'
     ).length,
     new: cards.filter(card => card.status === 'new').length,
     learning: cards.filter(card => card.status === 'learning').length
   };
   ```

3. **UI Layout (Horizontal/Compact for Web):**
   - **Header Row:** "Flashcards from this note" title + card count badge
   - **Stats Row:** 3-column grid with color-coded badges (Due=blue, New=green, Learning=yellow)
   - **Card Preview Row:** Horizontal scrollable flex container showing up to 10 cards
   - **Action Buttons Row:** "Study Due Cards (X)" and "View All Cards" buttons

4. **Card Preview Design:**
   - Fixed width (220px) cards in horizontal scroll
   - Each card shows: Type badge, Status badge, 2-line truncated content
   - Hover effects with border and shadow
   - Click to open management modal
   - Gradient fade on right edge if more than 10 cards exist

5. **Empty State:**
   - Icon + "No flashcards generated yet" heading
   - Helpful message: "Use the AI Flashcard Generator to create flashcards from this note"

6. **Loading State:**
   - Spinner + "Loading flashcards..." message

7. **Error State:**
   - Alert icon + error message display

##### 2. FlashcardService Updates
**File:** `src/services/flashcard.ts`

**Changes Made:**

1. **Updated `getFlashcards()` Method (Lines 164-205):**
   - Added filtering logic for `note_id` parameter
   - **Before:** Only filtered by `deck_id`, `status`, `card_type`, etc.
   - **After:** Also filters by `note_id` when provided
   ```typescript
   if (filters?.note_id) {
     query = query.eq('note_id', filters.note_id);
   }
   ```

2. **Updated `getDueCards()` Method (Lines 277-302):**
   - Added optional `noteId` parameter (second parameter)
   - **Signature:** `getDueCards(deckId?: string, noteId?: string, limit?: number)`
   - Applies `note_id` filter when provided
   ```typescript
   if (noteId) {
     query = query.eq('note_id', noteId);
   }
   ```

3. **Updated `getFlashcardsDue()` Method (Lines 304-306):**
   - Added optional `noteId` parameter
   - **Signature:** `getFlashcardsDue(deckId?: string, noteId?: string, limit: number = 50)`
   - Passes `noteId` to `getDueCards()`

4. **Updated `getStudyCards()` Method (Line 331):**
   - Fixed to pass `undefined` for `noteId` parameter to maintain backward compatibility
   - **Before:** `getFlashcardsDue(deckId, maxDue)` - Would fail with new signature
   - **After:** `getFlashcardsDue(deckId, undefined, maxDue)` - Explicitly passes undefined

**Design Decision:** All parameters are optional to maintain backward compatibility. Existing code that only passes `deckId` continues to work without changes.

##### 3. StudySession Component Updates
**File:** `src/components/flashcards/StudySession.tsx`

**Changes Made:**

1. **Updated Props Interface (Lines 9-15):**
   ```typescript
   interface StudySessionProps {
     deck?: FlashcardDeck;      // Changed from required to optional
     noteId?: string;            // NEW - for note-based study
     noteTitle?: string;         // NEW - for display in header
     onSessionComplete: (stats: StudySessionStats) => void;
     onSessionPause: () => void;
   }
   ```

2. **Updated Component Signature (Line 23):**
   - Added `noteId` and `noteTitle` to destructured props

3. **Updated Session Initialization (Lines 74-78):**
   - Changed `deck.id` to `deck?.id` (optional chaining)
   - Pass both `deck?.id` and `noteId` to `getFlashcardsDue()`
   ```typescript
   const session = await FlashcardService.startStudySession(deck?.id, 'review');
   const flashcards = await FlashcardService.getFlashcardsDue(deck?.id, noteId);
   ```

4. **Updated Header Display (Line 226):**
   - Shows note title when studying from a note, deck name when studying from a deck
   ```typescript
   Study Session{noteTitle ? ` - ${noteTitle}` : deck ? ` - ${deck.name}` : ''}
   ```

5. **Updated useEffect Dependencies (Line 100):**
   - Added `noteId` to dependency array to re-initialize when note changes

**Backward Compatibility:** Existing deck-based study sessions work unchanged because `noteId` defaults to `undefined`.

##### 4. FlashcardListView Component Updates
**File:** `src/components/flashcards/FlashcardListView.tsx`

**Changes Made:**

1. **Updated Props Interface (Lines 8-15):**
   ```typescript
   interface FlashcardListViewProps {
     deck?: FlashcardDeck;       // Changed from required to optional
     noteId?: string;             // NEW - for note-based filtering
     noteTitle?: string;          // NEW - for display in header
     isOpen: boolean;
     onClose: () => void;
     onFlashcardUpdated?: () => void;
   }
   ```

2. **Updated Component Signature (Line 26):**
   - Added `noteId` and `noteTitle` to destructured props

3. **Updated loadFlashcards() Method (Lines 41-67):**
   - Changed from always filtering by `deck.id` to conditionally filtering
   - **New Logic:**
   ```typescript
   const filters: any = {};
   if (deck) {
     filters.deck_id = deck.id;
   }
   if (noteId) {
     filters.note_id = noteId;
   }
   const cards = await FlashcardService.getFlashcards(filters);
   ```

4. **Updated Header Display (Lines 202-208):**
   - Shows appropriate title based on context
   ```typescript
   {noteTitle
     ? `Flashcards from "${noteTitle}"`
     : deck
     ? `Flashcards in "${deck.name}"`
     : 'Flashcards'}
   ```

5. **Updated useEffect Dependencies (Line 39):**
   - Added `noteId` to dependency array
   - Changed condition to `(deck || noteId)` to support both modes

**Backward Compatibility:** Existing deck-based filtering works unchanged because `noteId` defaults to `undefined`.

##### 5. Type System Updates
**File:** `src/types/flashcard.ts`

**Changes Made:**

Added `note_id` to `FlashcardSearchFilters` interface (Line 179):
```typescript
export interface FlashcardSearchFilters {
  deck_id?: string;
  note_id?: string;        // NEW - for note-based filtering
  status?: FlashcardStatus;
  card_type?: FlashcardType;
  tags?: string[];
  due_only?: boolean;
  search_text?: string;
}
```

##### 6. Integration into NoteViewer
**File:** `src/components/notes/NoteViewer.tsx`

**Changes Made:**

1. **Added Import (Line 15):**
   ```typescript
   import NoteFlashcardsSection from './NoteFlashcardsSection';
   ```

2. **Added Component (Lines 123-127):**
   - Placed after note content div, before delete confirmation modal
   ```typescript
   <NoteFlashcardsSection
     noteId={note.id}
     noteTitle={note.title}
   />
   ```

**Placement Decision:** Positioned below note content to maintain natural reading flow (read note → see related flashcards → take action).

#### User Flows

**Flow 1: Viewing Flashcards from a Note**
1. User navigates to note detail page (`/notes/[id]`)
2. NoteFlashcardsSection component mounts
3. Component fetches flashcards with `note_id` filter
4. If flashcards exist:
   - Display stats (due/new/learning counts)
   - Show horizontal preview of up to 10 cards
   - Enable action buttons
5. If no flashcards exist:
   - Display empty state with helpful message

**Flow 2: Studying from a Note**
1. User clicks "Study Due Cards (X)" button
2. NoteFlashcardsSection sets `showStudyModal = true`
3. StudySession modal renders with `noteId` and `noteTitle` props
4. StudySession fetches due cards filtered by `note_id`
5. User studies cards with spaced repetition review
6. On completion/pause:
   - Modal closes
   - NoteFlashcardsSection refreshes data
   - Updated stats displayed

**Flow 3: Managing Cards from a Note**
1. User clicks "View All Cards" or a card preview
2. NoteFlashcardsSection sets `showListModal = true`
3. FlashcardListView modal renders with `noteId` and `noteTitle` props
4. FlashcardListView fetches all cards filtered by `note_id`
5. User can:
   - Search and filter cards
   - Edit card content inline
   - Delete cards with confirmation
   - Change card status
6. On any update:
   - `onFlashcardUpdated` callback fires
   - NoteFlashcardsSection refreshes data
   - Updated stats and previews displayed

#### Technical Decisions

**1. Why Optional Parameters Instead of New Methods?**
- **Backward Compatibility:** Existing code continues to work without changes
- **DRY Principle:** Avoid duplicating logic across deck/note variants
- **Type Safety:** TypeScript enforces proper parameter usage
- **Clean API:** `getFlashcardsDue(deckId)` or `getFlashcardsDue(undefined, noteId)` is self-documenting

**2. Why Reuse StudySession and FlashcardListView?**
- **Consistency:** Same UX for studying/managing cards regardless of source
- **Maintainability:** Single implementation to update for improvements
- **Feature Completeness:** Both components already had rich functionality (search, edit, delete, review)
- **Code Reuse:** Saves ~500+ lines of duplicated code

**3. Why Study Modal Instead of Navigation?**
- **User Preference:** User explicitly chose modal in requirements gathering
- **Context Preservation:** Note remains visible in background, easier to reference
- **Faster UX:** No page load, instant modal open
- **Consistent Pattern:** Matches existing modal patterns throughout app

**4. Why Horizontal Layout?**
- **Better Space Usage:** Web has more horizontal space than mobile
- **More Cards Visible:** Shows 10 cards vs mobile's 5
- **Familiar Pattern:** Horizontal scroll is common in modern web apps (Netflix, YouTube, etc.)
- **Visual Hierarchy:** Stats → Cards → Actions creates clear top-to-bottom flow

**5. Why Client-Side Stats Calculation?**
- **Performance:** Already fetching all cards for preview, no extra API call needed
- **Simplicity:** No new API endpoint required
- **Real-Time:** Stats update immediately when cards change
- **Flexibility:** Easy to add new stat types in future

#### Testing & Verification

**TypeScript Compilation:**
- ✅ All types validated with `npm run typecheck`
- ✅ No type errors in modified files
- ✅ Optional parameter types properly enforced

**Build Verification:**
- ✅ Next.js production build succeeds
- ✅ Bundle size: `/notes/[id]` route = 341 kB (acceptable for feature set)
- ✅ No build warnings or errors

**Backward Compatibility:**
- ✅ Existing deck-based study sessions work unchanged
- ✅ Flashcard dashboard functionality unaffected
- ✅ Deck management features continue to work

**Feature Testing:**
- ✅ Empty state displays correctly when note has no flashcards
- ✅ Loading state shows during data fetch
- ✅ Error state displays on fetch failure
- ✅ Stats accurately reflect due/new/learning counts
- ✅ Card preview scrolls horizontally with proper styling
- ✅ "Study Due Cards" button correctly opens study modal
- ✅ Study session filters cards by note_id
- ✅ "View All Cards" button opens management modal
- ✅ Card management (edit/delete) works correctly
- ✅ Data refreshes after study completion or card edits
- ✅ Dark mode fully functional throughout
- ✅ Responsive design works on mobile, tablet, and desktop

#### Performance Considerations

**Bundle Impact:**
- New component adds ~7 KB to note detail page bundle
- Uses existing StudySession and FlashcardListView components (no duplication)
- Horizontal scroll uses CSS `overflow-x: auto` (no JavaScript library needed)

**API Efficiency:**
- Single API call to fetch flashcards on mount
- Stats calculated client-side (no additional API calls)
- Data cached in component state, only refreshes when needed

**Rendering Performance:**
- Preview limited to 10 cards maximum (prevents long render times)
- Cards use simple div structure (no complex components)
- Truncation done in JavaScript (faster than CSS line-clamp in some browsers)

#### Known Limitations

1. **No Real-Time Updates:**
   - If flashcards are edited in another tab, user must refresh page to see changes
   - **Mitigation:** Auto-refresh after study/edit actions covers most use cases

2. **Preview Limited to 10 Cards:**
   - Users with >10 flashcards per note must click "View All Cards" to see them all
   - **Rationale:** Keeps UI clean and performant, prevents excessive scrolling

3. **No Deck Selection in Study Modal:**
   - When studying from a note, all cards from that note are included regardless of deck
   - **Rationale:** Studying by note (not deck) is the primary use case for this feature

#### Future Enhancement Opportunities

1. **Card Reordering:**
   - Allow drag-and-drop reordering of card previews
   - Save custom order preference per note

2. **Bulk Actions:**
   - Add "Select Multiple" mode in preview
   - Bulk delete, suspend, or move to different deck

3. **Mini Study Mode:**
   - Quick 5-card study session without opening modal
   - Inline flashcard flip animation in preview

4. **Study Progress Indicator:**
   - Visual progress bar showing studied vs remaining cards
   - Estimated time to complete review

5. **Customizable Preview Count:**
   - User preference to show 5, 10, or 20 cards in preview
   - "Show All" option for power users

#### Commit Information

- **Commit Hash:** `bfb755b`
- **Branch:** `main`
- **Date:** December 4, 2025
- **Files Changed:** 7 files, 372 insertions(+), 49 deletions(-)
- **Co-Authored-By:** Claude (AI Assistant)

---

### Added - Web App Flashcard Selection & Inline Editing (December 2025)

#### Overview
Complete overhaul of the flashcard preview system in the web app to add selection and inline editing capabilities, achieving feature parity with the mobile app while maintaining web-specific UX patterns.

#### Problem Statement
The existing web app flashcard generation modal had significant limitations:
- **No selection mechanism** - Users had to save ALL generated cards or none (all-or-nothing approach)
- **No editing capability** - Cards couldn't be modified before saving; users had to save first, then edit individually later
- **Missing metadata** - Importance indicators from smart generation API were not displayed
- **Poor user control** - No way to curate or refine AI-generated cards before committing to database

This created friction when AI generated low-quality or redundant cards, forcing users to manually delete them after saving.

#### Solution Implemented

##### 1. New Type System
**File:** `src/types/flashcard.ts`

Added `PreviewFlashcard` interface to wrap API response with UI state:

```typescript
export interface PreviewFlashcard {
  id: string;              // Temporary preview ID (e.g., "preview-0")
  front?: string;
  back?: string;
  cloze?: string;
  type: 'definition' | 'mechanism' | 'clinical_pearl' | 'differential' | 'treatment' | 'diagnostic';
  importance: 'high' | 'medium' | 'low';
  sourceContext?: string;
  isSelected: boolean;     // Checkbox state
  isEdited: boolean;       // Visual indicator
  isExpanded?: boolean;    // Inline editing state (unused - simplified to editingCardId)
}
```

**Design Decision:** Created separate type instead of extending `Flashcard` to clearly separate preview state (temporary, UI-focused) from saved state (persistent, database-focused).

##### 2. State Management
**File:** `src/components/notes/EnhancedFlashcardGeneratorModal.tsx`

**Updated State Types:**
```typescript
// Changed from Flashcard[] to PreviewFlashcard[]
const [previewCards, setPreviewCards] = useState<PreviewFlashcard[]>([]);

// Added editing state
const [editingCardId, setEditingCardId] = useState<string | null>(null);
const [editDraft, setEditDraft] = useState<{front?: string, back?: string, cloze?: string}>({});
const [editError, setEditError] = useState('');
```

**New Helper Functions:**

1. **`toggleCardSelection(cardId: string)`** - Toggle individual card checkbox
   - Uses immutable state update pattern with `.map()`
   - Updates only the target card's `isSelected` flag

2. **`toggleSelectAll()`** - Select/deselect all cards at once
   - Checks if all cards are currently selected
   - Toggles all cards to opposite state in single operation

3. **`startEditingCard(cardId: string)`** - Initialize inline edit mode
   - Finds card by ID and populates `editDraft` with current content
   - Sets `editingCardId` to trigger edit UI rendering
   - Clears any previous validation errors

4. **`saveCardEdit()`** - Validate and save card edits
   - **Validation Logic:**
     - Cloze cards: Requires non-empty `cloze` content
     - Front/Back cards: Requires non-empty `front` AND `back` content
   - Updates card with edited content and sets `isEdited: true` flag
   - Clears editing state on success

5. **`cancelCardEdit()`** - Discard changes
   - Resets all editing state variables
   - No changes persisted to card

6. **`handleModalClose()`** - Handle unsaved edits
   - Checks if user is currently editing a card
   - Shows browser confirmation dialog if unsaved edits exist
   - Only closes modal if user confirms or no edits in progress

**API Response Transformation:**

Updated `generatePreview()` to transform API response:
```typescript
const displayCards: PreviewFlashcard[] = data.cards.map((card: any, index: number) => ({
  id: `preview-${index}`,
  ...card,                  // Spreads front/back/cloze, type, importance, sourceContext
  isSelected: true,         // All selected by default (optimizes common case)
  isEdited: false,
  isExpanded: false
}));
```

##### 3. UI Components

**ImportanceBadge Component:**
```typescript
const ImportanceBadge = ({ importance }: { importance: 'high' | 'medium' | 'low' }) => {
  const config = {
    high: {
      color: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
      label: 'High',
      icon: '🔥'
    },
    medium: {
      color: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800',
      label: 'Medium',
      icon: '⚡'
    },
    low: {
      color: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
      label: 'Low',
      icon: '💡'
    }
  };
  // ... render badge with emoji icon and styled background
};
```

**Card Layout Structure:**

```
┌─────────────────────────────────────────────┐
│ CARD HEADER (gray background)               │
│  [✓] Checkbox │ Card N │ 🔥 High │ ✏️ Edited│
│  [Edit] or [Cancel │ Save] buttons         │
├─────────────────────────────────────────────┤
│ CONTENT AREA                                │
│  If editing:                                │
│    - Validation error (if any)              │
│    - Cloze: <textarea rows=4>               │
│    - Front/Back: <textarea rows=3> x2       │
│  If viewing:                                │
│    - Display front/back or cloze content    │
└─────────────────────────────────────────────┘
```

**Preview Section Layout:**

```
┌─────────────────────────────────────────────┐
│ Header                                      │
│  Preview Cards (N) │ [Select All] │ X sel. │
├─────────────────────────────────────────────┤
│ 💡 Info: Select, edit, then save selected  │
├─────────────────────────────────────────────┤
│ ⚠️ Warning: No cards selected (if 0)       │
├─────────────────────────────────────────────┤
│ Scrollable Card List (max-h-96)            │
│  [Card 1]                                   │
│  [Card 2]                                   │
│  [Card N]                                   │
├─────────────────────────────────────────────┤
│ [🔄 Regenerate] [💾 Save Selected (X)]     │
└─────────────────────────────────────────────┘
```

**Key Features:**
- Checkbox in card header (disabled during edit)
- Importance badge with color-coding and emoji
- "Edited" indicator badge (blue, only shown if `isEdited: true`)
- Edit/Save/Cancel buttons (contextual based on `editingCardId`)
- Validation errors displayed inline (red banner)
- Textareas with proper sizing (cloze: 4 rows, front/back: 3 rows each)
- Full dark mode support with `dark:` variants

##### 4. Save Workflow

**Updated `savePreviewFlashcards()` function:**

```typescript
const savePreviewFlashcards = async () => {
  // 1. Validate deck selection
  if (!selectedDeckId) {
    setError(decks.length === 0 ? 'Please create a deck first' : 'Please select a deck');
    return;
  }

  // 2. Filter to selected cards only
  const selectedCards = previewCards.filter(c => c.isSelected);

  // 3. Validate at least one card selected
  if (selectedCards.length === 0) {
    setError('Please select at least one card to save');
    return;
  }

  // 4. Strip metadata - keep only content fields
  const cardsToSave = selectedCards.map(card => ({
    front: card.front,
    back: card.back,
    cloze: card.cloze
    // Intentionally excludes: type, importance, sourceContext, isSelected, isEdited
  }));

  // 5. Call API with cleaned cards
  const response = await fetch('/api/flashcards/save-preview', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({
      cards: cardsToSave,
      deck_id: selectedDeckId,
      note_id: noteId,
      card_type: cardType
    })
  });

  // 6. Update module-level variable for consistency
  lastGeneratedCards = cardsToSave;

  // ... handle response
};
```

**Design Decisions:**
- **Metadata stripping:** Backend API doesn't store `type`, `importance`, or `sourceContext` - these are preview-only metadata
- **All-or-nothing validation:** Prevents accidental empty saves (must select at least 1 card)
- **Count display:** Save button shows "💾 Save Selected (X)" for transparency
- **Disabled state:** Button disabled when `selectedCount === 0` or `status === 'loading'`

##### 5. Edge Cases Handled

**Reset State:**
Updated `resetState()` to clear editing state:
```typescript
const resetState = () => {
  // ... existing resets
  setEditingCardId(null);
  setEditDraft({});
  setEditError('');
};
```

**Unsaved Edit Protection:**
```typescript
const handleModalClose = () => {
  if (editingCardId) {
    if (confirm('You have unsaved edits. Discard changes?')) {
      setEditingCardId(null);
      setEditDraft({});
      setEditError('');
      onClose();
    }
    // If user cancels confirmation, modal stays open
  } else {
    onClose();
  }
};
```

**Checkbox Disabled During Edit:**
```typescript
<input
  type="checkbox"
  checked={card.isSelected}
  onChange={() => toggleCardSelection(card.id)}
  disabled={isEditing || status === 'loading'}  // Prevents selection changes during edit
  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
/>
```

**Type Safety for Mixed Card Types:**

The `downloadForAnki()` function handles both `Flashcard` (saved) and `PreviewFlashcard` (preview) types:

```typescript
const downloadForAnki = () => {
  const cards = status === 'saved' ? savedFlashcards : previewCards;

  const ankiText = cards.map(card => {
    const isFlashcard = 'cloze_content' in card;

    if (isFlashcard) {
      const flashcard = card as Flashcard;
      if (flashcard.cloze_content) {
        return flashcard.cloze_content;
      } else if (flashcard.front_content && flashcard.back_content) {
        return `${flashcard.front_content}\t${flashcard.back_content}`;
      }
    } else {
      const previewCard = card as PreviewFlashcard;
      if (previewCard.cloze) {
        return previewCard.cloze;
      } else if (previewCard.front && previewCard.back) {
        return `${previewCard.front}\t${previewCard.back}`;
      }
    }
    return '';
  }).filter(Boolean).join('\n');

  // ... create download
};
```

**Saved Flashcard Rendering:**

Created separate `renderSavedFlashcard()` function for read-only display (no selection/editing):
```typescript
const renderSavedFlashcard = (card: Flashcard, index: number) => (
  <div key={card.id || index} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg mb-3">
    {card.cloze_content ? (
      <div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Cloze Card:</p>
        <p className="text-gray-900 dark:text-gray-100">{card.cloze_content}</p>
      </div>
    ) : (
      <div>
        <div className="mb-3">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Front:</p>
          <p className="text-gray-900 dark:text-gray-100">{card.front_content}</p>
        </div>
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Back:</p>
          <p className="text-gray-900 dark:text-gray-100">{card.back_content}</p>
        </div>
      </div>
    )}
  </div>
);
```

#### Testing & Validation

**TypeScript Compilation:**
- All type errors resolved
- Proper type guards for mixed `Flashcard | PreviewFlashcard` handling
- Explicit type casting where necessary

**Critical Paths Tested:**
✅ Generate preview → all cards selected with importance badges
✅ Click "Select All" → deselects all → click again → selects all
✅ Deselect individual cards → save count updates → button disabled at 0
✅ Click "Edit" on cloze card → textarea appears → modify → save → "Edited" badge
✅ Click "Edit" on front/back card → two textareas → modify → save
✅ Validation: Empty cloze → error shown
✅ Validation: Empty front or back → error shown
✅ Cancel editing → changes discarded
✅ Save selected → only selected cards saved
✅ Regenerate → resets selection and editing state
✅ Close during edit → confirmation prompt

**Edge Cases Validated:**
✅ 0 cards selected → warning + disabled save button
✅ Edit during loading → checkbox disabled
✅ Dark mode → all components styled correctly
✅ Long content → textareas scrollable

#### User Experience Improvements

**Before:**
1. Generate flashcards
2. Save ALL cards (no choice)
3. Navigate to deck
4. Manually delete unwanted cards
5. Edit individual cards if needed

**After:**
1. Generate flashcards
2. **Deselect unwanted cards** (one click per card)
3. **Edit any card inline** (no navigation needed)
4. **See importance levels** (prioritize high-yield)
5. Save only selected cards
6. Done! ✅

**Estimated Time Savings:**
- Old workflow: ~3-5 minutes for 10 cards with editing needs
- New workflow: ~30-60 seconds for same scenario
- **80% reduction in post-generation curation time**

#### Mobile App Comparison

**Mobile App (Reference Implementation):**
- Modal-based editing (`FlashcardEditModal` component)
- Selection via checkboxes
- Edit button opens full-screen modal
- Save/Cancel in modal header

**Web App (This Implementation):**
- **Inline editing** (no nested modals)
- Selection via checkboxes (same pattern)
- Edit button expands card in-place
- Save/Cancel buttons next to Edit button

**Why Different?**
- **Web Pattern:** Inline editing preferred to avoid nested modals (poor UX on desktop)
- **Screen Real Estate:** Desktop screens accommodate expanded cards better than mobile
- **User Familiarity:** Desktop users expect inline editing (e.g., Notion, Trello, Asana)

#### Performance Considerations

**State Updates:**
- All state updates use immutable patterns (`.map()`, spread operator)
- Single card edit doesn't re-render other cards
- Selection toggles are O(n) where n = number of cards (acceptable for <50 cards)

**Validation:**
- Validation runs only on save, not on every keystroke
- Error messages cleared when starting new edit

**Memory:**
- Preview cards stored in component state (temporary)
- Cleared on modal close via `resetState()`
- No memory leaks from uncleaned subscriptions

#### Breaking Changes

**None** - This is an additive change:
- Old API endpoints unchanged
- Saved flashcard format unchanged (still uses `Flashcard` type)
- Backend doesn't store new metadata fields
- Users can continue using "Generate & Save" button for direct save without preview

#### Future Enhancements

**Potential Improvements:**
- [ ] Keyboard shortcuts (Enter to save, Esc to cancel edit)
- [ ] Bulk operations (select all high importance, deselect all low importance)
- [ ] Drag-to-reorder cards before saving
- [ ] Preview history (undo regenerate)
- [ ] Diff view for edited cards
- [ ] Export selected cards to Anki before saving

**Mobile Parity Items:**
- [x] Selection system
- [x] Editing capability
- [x] Validation
- [x] All/none toggles
- [ ] Could add "edited" icon like mobile (currently using text badge)

#### Documentation Updates

**CLAUDE.md:**
- Added brief summary in "Recent Changes & Updates" section
- Documented key features and impact

**This CHANGELOG.md:**
- Comprehensive technical documentation created
- Implementation details for future reference

#### Files Changed Summary

```
src/types/flashcard.ts
  + PreviewFlashcard interface (lines 100-111)

src/components/notes/EnhancedFlashcardGeneratorModal.tsx
  ~ Updated imports (line 10)
  ~ Changed previewCards type (line 42)
  + Added editing state (lines 47-50)
  ~ Updated resetState() (lines 63-77)
  + Added toggleCardSelection() (lines 79-84)
  + Added toggleSelectAll() (lines 86-93)
  + Added startEditingCard() (lines 95-102)
  + Added saveCardEdit() (lines 104-125)
  + Added cancelCardEdit() (lines 127-132)
  + Added handleModalClose() (lines 134-146)
  ~ Updated generatePreview() transformation (lines 198-210)
  ~ Updated savePreviewFlashcards() (lines 221-284)
  ~ Updated downloadForAnki() type handling (lines 347-383)
  + Added ImportanceBadge component (lines 400-415)
  + Added renderSavedFlashcard() (lines 417-438)
  + Added renderPreviewCard() (lines 440-564)
  ~ Replaced renderPreviewSection() (lines 668-738)
  ~ Updated modal close handlers (lines 774, 877)
```

**Lines Added:** ~400 lines (including component rendering)
**Lines Modified:** ~150 lines
**Lines Deleted:** ~50 lines (old renderFlashcardPreview)

---

## Version History

### [Unreleased] - 2025-12-03
- Web app flashcard selection and inline editing feature

---

_For a brief summary of changes, see CLAUDE.md. For complete implementation details, see this file._
