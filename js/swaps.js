// ════════════════════════════════════════════════════════
// SLOT-SWAPPING ENGINE — 단어 갈아끼우기 3연속 변주 엔진 (js/swaps.js)
// Keeps the grammatical spine fixed and swaps real-life slots
// 3 times in a row so learners transfer textbook sentences to real speech.
// ════════════════════════════════════════════════════════

const SlotSwapEngine = (() => {
  const USER_SWAP_KEY = 'uni_user_swaps';
  let _userSwaps = {};
  try {
    _userSwaps = JSON.parse((typeof localStorage !== 'undefined' && localStorage.getItem(USER_SWAP_KEY)) || '{}');
  } catch (_) { _userSwaps = {}; }

  // Rich curated bank covering Gyeollon Ch.1~17, Mouse Dance Ch.1~16, and Pattern 30 Days
  const SWAP_BANK = [
    {
      re: /step outside/i,
      frame: 'Can you [ 동작 ] for a second [ 조건 ]?',
      starter: 'Can you ',
      swaps: [
        { kr: '잠깐 <span class="swap-hl">여기서 기다려</span> 줄 수 있어?', en: 'Can you <span class="swap-hl">wait here</span> for a second?', hint: 'wait here' },
        { kr: '<span class="swap-hl">회의 끝나고</span> 잠깐 <span class="swap-hl">얘기 좀</span> 할 수 있어?', en: 'Can we <span class="swap-hl">talk privately</span> for a second <span class="swap-hl">after the meeting</span>?', hint: 'talk privately / after the meeting' },
        { kr: '<span class="swap-hl">바쁘지 않으면</span> 이거 잠깐만 <span class="swap-hl">잡아줄</span> 수 있어?', en: 'Can you <span class="swap-hl">hold this</span> for a second <span class="swap-hl">if you\'re not busy</span>?', hint: 'hold this / if you\'re not busy' }
      ]
    },
    {
      re: /have a problem with/i,
      frame: 'Do you have a problem with [ 대상 ]?',
      starter: 'I don\'t have a problem with ',
      swaps: [
        { kr: '혹시 <span class="swap-hl">제 결정에</span> 불만/문제 있으세요?', en: 'Do you have a problem with <span class="swap-hl">my decision</span>?', hint: 'my decision' },
        { kr: '나는 <span class="swap-hl">이번 일정에</span> 전혀 문제 없어.', en: 'I don\'t have a problem with <span class="swap-hl">this schedule</span> at all.', hint: 'this schedule' },
        { kr: '혹시 <span class="swap-hl">새로 온 매니저랑</span> 무슨 문제 있어?', en: 'Do you have a problem with <span class="swap-hl">the new manager</span>?', hint: 'the new manager' }
      ]
    },
    {
      re: /quit .* job|before you get married|before I get married/i,
      frame: 'going to [ 핵심 행동 ] before [ 시점·사건 ]',
      starter: 'I\'m going to ',
      swaps: [
        { kr: '<span class="swap-hl">퇴근하기</span> 바로 직전에 <span class="swap-hl">이 보고서 끝낼</span> 거야.', en: 'I\'m going to <span class="swap-hl">finish this report</span> just before <span class="swap-hl">I leave work</span>.', hint: 'finish this report / I leave work' },
        { kr: '왜 <span class="swap-hl">보너스 받기</span> 바로 직전에 <span class="swap-hl">그만두려고</span> 해?', en: 'Why are you going to <span class="swap-hl">quit</span> just before <span class="swap-hl">you get your bonus</span>?', hint: 'quit / you get your bonus' },
        { kr: '<span class="swap-hl">비 오기</span> 전에 <span class="swap-hl">집에 출발할</span> 거야.', en: 'I\'m going to <span class="swap-hl">head home</span> before <span class="swap-hl">it starts raining</span>.', hint: 'head home / it starts raining' }
      ]
    },
    {
      re: /get motivated|got motivated/i,
      frame: 'get motivated after [ 계기·경험 ]',
      starter: 'I got motivated after ',
      swaps: [
        { kr: '<span class="swap-hl">그 책 읽고 나서</span> 동기부여가 확 됐어.', en: 'I got motivated after <span class="swap-hl">reading that book</span>.', hint: 'reading that book' },
        { kr: '<span class="swap-hl">그 강연 보고 나서</span> 동기부여 됐어?', en: 'Did you get motivated after <span class="swap-hl">watching his speech</span>?', hint: 'watching his speech' },
        { kr: '<span class="swap-hl">아침 운동 시작하고 나서</span> 다시 의욕이 생겼어.', en: 'I got motivated again after <span class="swap-hl">starting morning workouts</span>.', hint: 'starting morning workouts' }
      ]
    },
    {
      re: /starts going down|give up my business/i,
      frame: 'What are you gonna do if [ 미래 상황 ]?',
      starter: 'What are you gonna do if ',
      swaps: [
        { kr: '<span class="swap-hl">오늘 밤 비가 오기 시작하면</span> 뭐 할 거야?', en: 'What are you gonna do if <span class="swap-hl">it starts raining tonight</span>?', hint: 'it starts raining tonight' },
        { kr: '<span class="swap-hl">비행기 연착되면</span> 어떻게 할 거야?', en: 'What are you gonna do if <span class="swap-hl">our flight gets delayed</span>?', hint: 'our flight gets delayed' },
        { kr: '<span class="swap-hl">매출이 계속 떨어지면</span> 계획을 바꿔야 할 것 같아.', en: 'I think we have to change our plan if <span class="swap-hl">sales keep going down</span>.', hint: 'sales keep going down' }
      ]
    },
    {
      re: /sick and tired of|look on the bright side|can't take/i,
      frame: 'I\'m sick and tired of [ 지긋지긋한 일~ing ]',
      starter: 'I\'m sick and tired of ',
      swaps: [
        { kr: '매일 아침 <span class="swap-hl">지하철에 치이는 게</span> 이제 지긋지긋해.', en: 'I\'m sick and tired of <span class="swap-hl">taking the crowded subway</span> every morning.', hint: 'taking the crowded subway' },
        { kr: '<span class="swap-hl">똑같은 변명 듣는 것도</span> 정말 지긋지긋해.', en: 'I\'m sick and tired of <span class="swap-hl">hearing the same excuses</span>.', hint: 'hearing the same excuses' },
        { kr: '더 이상 <span class="swap-hl">야근하는 건</span> 못 버티겠어.', en: 'I can\'t take <span class="swap-hl">working overtime</span> anymore.', hint: 'working overtime' }
      ]
    },
    {
      re: /anything to watch|nothing to do|getting bored|get together/i,
      frame: 'Is there anything to [ 동사 ]? / I have nothing to [ 동사 ]',
      starter: 'Is there anything to ',
      swaps: [
        { kr: '집에 <span class="swap-hl">먹을 거</span> 좀 있어?', en: 'Is there anything to <span class="swap-hl">eat at home</span>?', hint: 'eat at home' },
        { kr: '오늘 주말인데 <span class="swap-hl">입을 옷이</span> 하나도 없네.', en: 'I have nothing to <span class="swap-hl">wear this weekend</span>.', hint: 'wear this weekend' },
        { kr: '이번 금요일에 <span class="swap-hl">모여서 저녁이나 먹을래</span>?', en: 'Do you wanna get together and <span class="swap-hl">grab dinner this Friday</span>?', hint: 'grab dinner this Friday' }
      ]
    },
    {
      re: /out of .* league|strike .* conversation|over there/i,
      frame: 'strike up a conversation with [ 상대 ]',
      starter: 'I tried to strike up a conversation with ',
      swaps: [
        { kr: '<span class="swap-hl">비행기 옆자리 사람한테</span> 먼저 말을 걸어봤어.', en: 'I struck up a conversation with <span class="swap-hl">the person next to me on the plane</span>.', hint: 'the person next to me' },
        { kr: '그 회사는 <span class="swap-hl">내 수준엔 너무 높은 곳</span> 같아?', en: 'Do you think <span class="swap-hl">that company</span> is out of my league?', hint: 'that company' },
        { kr: '가서 인사하고 <span class="swap-hl">가볍게 대화를 시작해</span> 봐.', en: 'Just go say hi and <span class="swap-hl">strike up a casual conversation</span>.', hint: 'strike up a casual conversation' }
      ]
    },
    {
      re: /remember the .* told|find the .* lost|people who|cell phone that|dress .* showed|place .* went to|gift .* promised|necklace that/i,
      frame: '[ 핵심 명사 ] + (that/who) + [ 내가 ~했던 설명 ]',
      starter: 'Do you remember the place ',
      swaps: [
        { kr: '저번에 <span class="swap-hl">네가 추천해 준 카페</span> 기억나?', en: 'Do you remember <span class="swap-hl">the cafe you recommended</span> last time?', hint: 'the cafe you recommended' },
        { kr: '<span class="swap-hl">어제 주문한 택배</span> 벌써 도착했어!', en: '<span class="swap-hl">The package I ordered yesterday</span> already arrived!', hint: 'The package I ordered yesterday' },
        { kr: '<span class="swap-hl">배터리 오래가는 노트북</span>이 필요해요.', en: 'I need <span class="swap-hl">a laptop that has great battery life</span>.', hint: 'a laptop that has great battery life' }
      ]
    },
    {
      re: /how to|as .* as|get the hang of|stop thinking about/i,
      frame: 'Do you know how to [ 동사 ]? / not as [ 형용사 ] as it sounds',
      starter: 'Do you know how to ',
      swaps: [
        { kr: '<span class="swap-hl">이 커피머신 어떻게 쓰는지</span> 알아?', en: 'Do you know how to <span class="swap-hl">use this coffee machine</span>?', hint: 'use this coffee machine' },
        { kr: '영어 스피킹도 요령만 잡으면 <span class="swap-hl">생각만큼 어렵지 않아</span>.', en: 'Speaking English is <span class="swap-hl">not as hard as you think</span> once you get the hang of it.', hint: 'not as hard as you think' },
        { kr: '아까 들은 <span class="swap-hl">그 노래가 자꾸 머릿속에 맴돌아</span>.', en: 'I can\'t stop thinking about <span class="swap-hl">that song I heard earlier</span>.', hint: 'that song I heard earlier' }
      ]
    },
    {
      re: /not supposed to|supposed to|anything but|want you to/i,
      frame: 'I\'m / You\'re supposed to [ 하기로 된 일 ]',
      starter: 'I\'m supposed to ',
      swaps: [
        { kr: '오늘 오후 3시에 <span class="swap-hl">치과 가기로</span> 되어 있어.', en: 'I\'m supposed to <span class="swap-hl">see the dentist at 3 p.m.</span> today.', hint: 'see the dentist at 3 p.m.' },
        { kr: '여기서는 <span class="swap-hl">사진 찍으면 안 되게</span> 되어 있어요.', en: 'You\'re not supposed to <span class="swap-hl">take photos in here</span>.', hint: 'take photos in here' },
        { kr: '내가 원하는 건 너한테 <span class="swap-hl">솔직하게 말해달라는</span> 거야.', en: 'I just want you to <span class="swap-hl">be honest with me</span>.', hint: 'be honest with me' }
      ]
    },
    {
      re: /charge on my bill|make that purchase|was made|prohibited|is cancelled|is delayed/i,
      frame: '[ 대상 ] + is/was + [ 상태(과거분사) ]',
      starter: 'My reservation was ',
      swaps: [
        { kr: '<span class="swap-hl">제 예약이</span> 실수로 취소되었어요.', en: '<span class="swap-hl">My reservation was cancelled</span> by mistake.', hint: 'My reservation was cancelled' },
        { kr: '폭설 때문에 <span class="swap-hl">기차가 30분 지연되었어요</span>.', en: '<span class="swap-hl">The train is delayed</span> by 30 minutes due to heavy snow.', hint: 'The train is delayed' },
        { kr: '명세서에 <span class="swap-hl">제가 결제하지 않은 내역이</span> 찍혀 있어요.', en: 'There\'s <span class="swap-hl">a payment on my card</span> I didn\'t make.', hint: 'a payment on my card' }
      ]
    },
    {
      re: /always wanted to|in a while|up to\b/i,
      frame: 'I\'ve always wanted to [ 오랜 로망 ] / haven\'t ~ in a while',
      starter: 'I\'ve always wanted to ',
      swaps: [
        { kr: '예전부터 <span class="swap-hl">스페인어를 꼭 배워보고</span> 싶었어.', en: 'I\'ve always wanted to <span class="swap-hl">learn Spanish</span>.', hint: 'learn Spanish' },
        { kr: '<span class="swap-hl">운동 안 한 지</span> 꽤 오래됐네.', en: 'I haven\'t <span class="swap-hl">worked out</span> in a while.', hint: 'worked out' },
        { kr: '이번 주말에 <span class="swap-hl">뭐 할 예정이야</span>?', en: 'What are you <span class="swap-hl">up to this weekend</span>?', hint: 'up to this weekend' }
      ]
    },
    {
      re: /Speaking of|opportunity to|open your mind/i,
      frame: 'Speaking of [ 화제 ], [ 이어갈 말 ]',
      starter: 'Speaking of ',
      swaps: [
        { kr: '<span class="swap-hl">커피 얘기가 나와서 말인데</span>, 새로 생긴 카페 가봤어?', en: 'Speaking of <span class="swap-hl">coffee, have you tried the new cafe</span>?', hint: 'coffee / tried the new cafe' },
        { kr: '<span class="swap-hl">제주도 하니까 말인데</span>, 다음 휴가 때 거기 갈까?', en: 'Speaking of <span class="swap-hl">Jeju, should we go there next vacation</span>?', hint: 'Jeju / next vacation' },
        { kr: '이번 프로젝트가 <span class="swap-hl">실력을 키울 좋은 기회를</span> 줄 거야.', en: 'This project will give you the opportunity to <span class="swap-hl">grow your skills</span>.', hint: 'grow your skills' }
      ]
    },
    {
      re: /worried|concerned about|deliveries are arriving|excuses/i,
      frame: 'I\'m worried about [ 걱정거리 ]',
      starter: 'I\'m a bit worried about ',
      swaps: [
        { kr: '<span class="swap-hl">내일 있을 발표가</span> 좀 걱정돼.', en: 'I\'m worried about <span class="swap-hl">tomorrow\'s presentation</span>.', hint: 'tomorrow\'s presentation' },
        { kr: '<span class="swap-hl">마감 기한 못 맞출까 봐</span> 걱정이에요.', en: 'I\'m concerned about <span class="swap-hl">missing the deadline</span>.', hint: 'missing the deadline' },
        { kr: '<span class="swap-hl">새로 주문한 가구가</span> 내일 오후에 도착해요.', en: '<span class="swap-hl">Our new furniture is arriving</span> tomorrow afternoon.', hint: 'Our new furniture is arriving' }
      ]
    },
    {
      re: /It seems like|It looks like|It sounds like|It feels like/i,
      frame: 'It seems / looks / sounds like [ 주어 + 동사 ]',
      starter: 'It looks like ',
      swaps: [
        { kr: '곧 <span class="swap-hl">비가 쏟아질 것</span>처럼 보여.', en: 'It looks like <span class="swap-hl">it\'s going to pour soon</span>.', hint: 'it\'s going to pour soon' },
        { kr: '들어보니 <span class="swap-hl">정말 좋은 조건인 것</span> 같네!', en: 'It sounds like <span class="swap-hl">a really great deal</span>!', hint: 'a really great deal' },
        { kr: '요즘 <span class="swap-hl">다들 엄청 바쁜 것</span> 같아.', en: 'It seems like <span class="swap-hl">everyone is super busy these days</span>.', hint: 'everyone is super busy' }
      ]
    },
    {
      re: /went from .* to|went through|remember you from/i,
      frame: 'went from [ 과거 상태 ] to [ 현재 변화 ]',
      starter: 'I went from ',
      swaps: [
        { kr: '<span class="swap-hl">영어 한마디 못 하던 상태에서</span> 자신 있게 말하게 됐어.', en: 'I went from <span class="swap-hl">being afraid of English</span> to <span class="swap-hl">speaking confidently</span>.', hint: 'afraid -> speaking confidently' },
        { kr: '작년에 정말 <span class="swap-hl">많은 우여곡절을 겪었어</span>.', en: 'I went through <span class="swap-hl">a lot of ups and downs</span> last year.', hint: 'a lot of ups and downs' },
        { kr: '저 <span class="swap-hl">지난번 세미나에서</span> 뵌 기억이 나요!', en: 'I remember you from <span class="swap-hl">the seminar last month</span>!', hint: 'the seminar last month' }
      ]
    },
    {
      re: /All you have to do is|Most of the time/i,
      frame: 'All you have to do is [ 딱 이것만 하면 되는 행동 ]',
      starter: 'All you have to do is ',
      swaps: [
        { kr: '그냥 <span class="swap-hl">여기 서명만 하시면</span> 됩니다.', en: 'All you have to do is <span class="swap-hl">sign right here</span>.', hint: 'sign right here' },
        { kr: '하루에 <span class="swap-hl">딱 10분씩만 소리 내어 읽으면</span> 돼.', en: 'All you have to do is <span class="swap-hl">practice out loud for 10 minutes a day</span>.', hint: 'practice out loud for 10 minutes' },
        { kr: '<span class="swap-hl">평소에는 집밥을 먹지만</span>, 가끔 배달 시켜 먹어.', en: 'Most of the time <span class="swap-hl">I cook at home</span>, but sometimes I order delivery.', hint: 'I cook at home' }
      ]
    },
    {
      re: /put .* on hold|talk .* out of|embrace|long way to go|walk out on/i,
      frame: 'put [ 계획 ] on hold / talk [ 사람 ] out of [ 행동~ing ]',
      starter: 'We need to put ',
      swaps: [
        { kr: '<span class="swap-hl">여행 계획을</span> 당분간 보류해야 할 것 같아.', en: 'I think we need to put <span class="swap-hl">our trip</span> on hold for now.', hint: 'our trip' },
        { kr: '친구가 <span class="swap-hl">충동구매하려는 걸</span> 겨우 말렸어.', en: 'I tried to talk my friend out of <span class="swap-hl">buying it on impulse</span>.', hint: 'buying it on impulse' },
        { kr: '많이 좋아졌지만 아직 <span class="swap-hl">갈 길이 멀어</span>.', en: 'We\'ve made progress, but we still <span class="swap-hl">have a long way to go</span>.', hint: 'have a long way to go' }
      ]
    },
    {
      re: /decided I'm gonna|I'm surprised|One thing I love/i,
      frame: 'I\'ve decided I\'m gonna [ 새로운 결심 ]',
      starter: 'I\'ve decided I\'m gonna ',
      swaps: [
        { kr: '오늘부터 <span class="swap-hl">일찍 자기로</span> 마음먹었어.', en: 'I\'ve decided I\'m gonna <span class="swap-hl">go to bed early</span> starting today.', hint: 'go to bed early' },
        { kr: '이 동네에서 <span class="swap-hl">제일 마음에 드는 점 하나는</span> 조용하다는 거야.', en: 'One thing I love about <span class="swap-hl">this neighborhood</span> is that it\'s quiet.', hint: 'this neighborhood / it\'s quiet' },
        { kr: '<span class="swap-hl">벌써 시간이 이렇게 됐다니</span> 놀랍네!', en: 'I\'m surprised <span class="swap-hl">it\'s already this late</span>!', hint: 'it\'s already this late' }
      ]
    },
    {
      re: /How was|Are you free|hang out|How about/i,
      frame: 'How was [ 명사 ]? / Are you free [ 시간 ]?',
      starter: 'How was ',
      swaps: [
        { kr: '오늘 <span class="swap-hl">출장/미팅</span> 어땠어?', en: 'How was <span class="swap-hl">your meeting today</span>?', hint: 'your meeting today' },
        { kr: '너 <span class="swap-hl">내일 저녁에</span> 시간 돼?', en: 'Are you free <span class="swap-hl">tomorrow evening</span>?', hint: 'tomorrow evening' },
        { kr: '오랜만에 주말에 <span class="swap-hl">같이 시간 보낼래</span>?', en: 'Do you wanna <span class="swap-hl">hang out this weekend</span>?', hint: 'hang out this weekend' }
      ]
    },
    {
      re: /get rid of|hit the gym|walking distance|belly/i,
      frame: 'get rid of [ 없앨 것 ] / within walking distance of [ 장소 ]',
      starter: 'It\'s within walking distance of ',
      swaps: [
        { kr: '<span class="swap-hl">안 입는 옷들 좀</span> 싹 정리해야겠어.', en: 'I need to get rid of <span class="swap-hl">these old clothes</span>.', hint: 'these old clothes' },
        { kr: '퇴근하고 바로 <span class="swap-hl">헬스장 가려고</span>!', en: 'I\'m gonna <span class="swap-hl">hit the gym</span> right after work!', hint: 'hit the gym' },
        { kr: '그 카페는 <span class="swap-hl">지하철역에서 걸어갈 수 있는 거리에</span> 있어.', en: 'The cafe is within walking distance of <span class="swap-hl">the subway station</span>.', hint: 'the subway station' }
      ]
    },
    {
      re: /press \d|work in|getting used to|settle in/i,
      frame: 'I work in [ 분야 ] / getting used to [ 새로운 환경 ]',
      starter: 'I\'m still getting used to ',
      swaps: [
        { kr: '실례지만 <span class="swap-hl">12층 좀 눌러</span> 주시겠어요?', en: 'Can you <span class="swap-hl">press 12</span>, please?', hint: 'press 12' },
        { kr: '저는 <span class="swap-hl">IT 디자인 분야에서</span> 일하고 있어요.', en: 'I work in <span class="swap-hl">IT and product design</span>.', hint: 'IT and product design' },
        { kr: '아직 <span class="swap-hl">새 출퇴근 루틴에</span> 적응하는 중이에요.', en: 'I\'m still getting used to <span class="swap-hl">my new commute</span>.', hint: 'my new commute' }
      ]
    },
    {
      re: /help me|give .* a bath|tuck .* in|chores/i,
      frame: 'Could you help me [ 동사원형 ]?',
      starter: 'Could you help me ',
      swaps: [
        { kr: '<span class="swap-hl">이 짐 옮기는 것</span> 좀 도와줄 수 있어?', en: 'Could you help me <span class="swap-hl">carry these boxes</span>?', hint: 'carry these boxes' },
        { kr: '<span class="swap-hl">설거지하는 것</span> 좀 도와줄래?', en: 'Could you help me <span class="swap-hl">do the dishes</span>?', hint: 'do the dishes' },
        { kr: '주말 오전에는 밀린 <span class="swap-hl">집안일을 해치워야</span> 해.', en: 'I need to catch up on <span class="swap-hl">household chores</span> Saturday morning.', hint: 'household chores' }
      ]
    },
    {
      re: /out of my mind|the way she|the way he/i,
      frame: 'can\'t get [ 대상 ] out of my mind / love the way [ 주어+동사 ]',
      starter: 'I love the way ',
      swaps: [
        { kr: '<span class="swap-hl">어제 본 영화 장면이</span> 머릿속에서 안 떠나.', en: 'I can\'t get <span class="swap-hl">that movie scene</span> out of my mind.', hint: 'that movie scene' },
        { kr: '그 사람이 <span class="swap-hl">웃는 모습이</span> 참 좋더라.', en: 'I love the way <span class="swap-hl">he smiles</span>.', hint: 'he smiles' },
        { kr: '네가 <span class="swap-hl">문제를 차분하게 해결하는 방식이</span> 멋져.', en: 'I love the way <span class="swap-hl">you handle problems calmly</span>.', hint: 'you handle problems calmly' }
      ]
    },
    {
      re: /looking for|ongoing|within .* budget|feel free to/i,
      frame: 'I\'m looking for [ 찾는 물건 + 용도 ]',
      starter: 'I\'m looking for ',
      swaps: [
        { kr: '<span class="swap-hl">부모님께 드릴 생신 선물을</span> 찾고 있어요.', en: 'I\'m looking for <span class="swap-hl">a birthday gift for my parents</span>.', hint: 'a birthday gift for my parents' },
        { kr: '다행히 딱 <span class="swap-hl">내 예산 범위 안에</span> 들어오네!', en: 'Thankfully, it\'s <span class="swap-hl">right within my budget</span>!', hint: 'right within my budget' },
        { kr: '궁금한 점 있으시면 <span class="swap-hl">언제든 편하게 물어보세요</span>.', en: 'Feel free to <span class="swap-hl">ask me anytime</span> if you have questions.', hint: 'ask me anytime' }
      ]
    },
    {
      re: /stain|rub .* off|come off|come across|look .* up/i,
      frame: 'happened to come across [ 우연히 발견한 것 ]',
      starter: 'I happened to come across ',
      swaps: [
        { kr: '서랍 정리하다가 우연히 <span class="swap-hl">옛날 사진들을</span> 발견했어.', en: 'I happened to come across <span class="swap-hl">some old photos</span> while cleaning.', hint: 'some old photos' },
        { kr: '셔츠에 묻은 <span class="swap-hl">커피 자국이 잘 안 지워져</span>.', en: 'This <span class="swap-hl">coffee stain</span> on my shirt won\'t come off.', hint: 'coffee stain' },
        { kr: '모르는 표현은 바로 <span class="swap-hl">사전에서 찾아봐</span>.', en: 'Just <span class="swap-hl">look it up</span> online right away.', hint: 'look it up' }
      ]
    },
    {
      re: /having .* over|have .* over|pick up .* on the way|take long/i,
      frame: 'pick up [ 살 것 ] on the way / have [ 손님 ] over',
      starter: 'Do you want me to pick up ',
      swaps: [
        { kr: '오는 길에 <span class="swap-hl">커피 두 잔</span> 사 갈까?', en: 'Do you want me to pick up <span class="swap-hl">two coffees</span> on the way?', hint: 'two coffees' },
        { kr: '이번 토요일에 <span class="swap-hl">친구들 집에 불러서</span> 피자 먹으려고.', en: 'I\'m having <span class="swap-hl">some friends</span> over for pizza this Saturday.', hint: 'some friends' },
        { kr: '금방 끝나, <span class="swap-hl">10분도 안 걸릴 거야</span>.', en: 'It won\'t take long — <span class="swap-hl">less than 10 minutes</span>.', hint: 'less than 10 minutes' }
      ]
    },
    {
      re: /take off|addictive|allergic to|brought you/i,
      frame: 'You can [ 안내 행동 ] here / allergic to [ 대상 ]',
      starter: 'You can ',
      swaps: [
        { kr: '<span class="swap-hl">외투는 여기에</span> 걸어두셔도 돼요.', en: 'You can <span class="swap-hl">hang your coat</span> right here.', hint: 'hang your coat' },
        { kr: '이 과자 한번 먹기 시작하면 <span class="swap-hl">진짜 중독성 장난 아니야</span>.', en: 'Once you try these chips, <span class="swap-hl">they get so addictive</span>.', hint: 'they get so addictive' },
        { kr: '저는 <span class="swap-hl">새우/갑각류 알레르기가</span> 있어요.', en: 'I\'m allergic to <span class="swap-hl">shrimp and shellfish</span>.', hint: 'shrimp and shellfish' }
      ]
    },
    {
      re: /fill out|just in case|preoccupied|participate in/i,
      frame: '[ 행동 ] + just in case [ 혹시 모를 상황 ]',
      starter: 'Let\'s ',
      swaps: [
        { kr: '혹시 비 올지 모르니까 <span class="swap-hl">우산 챙기자</span>.', en: 'Let\'s <span class="swap-hl">bring an umbrella</span> just in case it rains.', hint: 'bring an umbrella' },
        { kr: '혹시 자리 다 찰까 봐 <span class="swap-hl">미리 예약해 뒀어</span>.', en: 'I <span class="swap-hl">booked a table early</span> just in case it gets full.', hint: 'booked a table early' },
        { kr: '입장 전에 <span class="swap-hl">간단한 신청서를 작성해</span> 주세요.', en: 'Please fill out <span class="swap-hl">this short form</span> before entering.', hint: 'this short form' }
      ]
    },
    {
      re: /for sale|good condition|negotiable|wire the money/i,
      frame: 'put [ 물건 ] up for sale / wire the money to [ 계좌 ]',
      starter: 'I put ',
      swaps: [
        { kr: '안 쓰는 <span class="swap-hl">아이패드를 중고로</span> 내놨어.', en: 'I put <span class="swap-hl">my old iPad</span> up for sale.', hint: 'my old iPad' },
        { kr: '거의 새 거라 <span class="swap-hl">상태가 정말 깨끗해요</span>.', en: 'It\'s barely used and <span class="swap-hl">in great condition</span>.', hint: 'in great condition' },
        { kr: '지금 바로 <span class="swap-hl">계좌로 입금해</span> 드릴게요.', en: 'Let me <span class="swap-hl">send the money</span> to your account right now.', hint: 'send the money' }
      ]
    },
    {
      re: /non-stop|falling behind|take .* time off|drained/i,
      frame: 'I\'ve been [ ~ing ] / take some time off [ 대상 ]',
      starter: 'I\'ve been ',
      swaps: [
        { kr: '오늘 아침부터 <span class="swap-hl">쉬지 않고 회의만</span> 했더니 진이 다 빠졌어.', en: 'I\'ve been <span class="swap-hl">in meetings non-stop</span> since morning, so I\'m drained.', hint: 'in meetings non-stop' },
        { kr: '이번 금요일에 <span class="swap-hl">연차 내고 좀 쉬는 게</span> 어때?', en: 'Why don\'t you <span class="swap-hl">take Friday off</span> and recharge?', hint: 'take Friday off' },
        { kr: '진도가 좀 <span class="swap-hl">밀리는 기분이</span> 들어.', en: 'I feel like I\'m <span class="swap-hl">falling behind on my schedule</span>.', hint: 'falling behind on my schedule' }
      ]
    },
    {
      re: /blinking|flickering|running out of|went out|depends on/i,
      frame: 'We\'re running out of [ 부족한 것 ] / It depends on [ 변수 ]',
      starter: 'We\'re running out of ',
      swaps: [
        { kr: '우리 이제 <span class="swap-hl">시간이 별로 안 남았어</span>!', en: 'We\'re running out of <span class="swap-hl">time</span>!', hint: 'time' },
        { kr: '휴대폰 <span class="swap-hl">배터리가 거의 다 닳아가</span>.', en: 'My phone is running out of <span class="swap-hl">battery</span>.', hint: 'battery' },
        { kr: '그건 <span class="swap-hl">오늘 날씨에 따라</span> 달라질 것 같아.', en: 'It depends on <span class="swap-hl">the weather today</span>.', hint: 'the weather today' }
      ]
    },
    {
      re: /what we ordered|what I told|how I/i,
      frame: 'This is (not) what / where / how [ 주어 + 동사 ]',
      starter: 'This is how I ',
      swaps: [
        { kr: '죄송한데 이건 <span class="swap-hl">제가 주문한 메뉴가 아니에요</span>.', en: 'Excuse me, this is not <span class="swap-hl">what I ordered</span>.', hint: 'what I ordered' },
        { kr: '여기가 바로 <span class="swap-hl">내가 말했던 그 맛집이야</span>!', en: 'This is <span class="swap-hl">the place I told you about</span>!', hint: 'the place I told you about' },
        { kr: '이게 바로 내가 <span class="swap-hl">스트레스를 푸는 방법이야</span>.', en: 'This is how I <span class="swap-hl">relieve stress after work</span>.', hint: 'relieve stress after work' }
      ]
    },
    // ── Pattern 30 Specific High-Frequency Spines
    {
      re: /^I'm trying to\b/i,
      frame: 'I\'m trying to [ 지금 애쓰고 있는 행동 ]',
      starter: 'I\'m trying to ',
      swaps: [
        { kr: '요즘 <span class="swap-hl">커피를 좀 줄이려고</span> 노력 중이야.', en: 'I\'m trying to <span class="swap-hl">cut back on coffee</span> these days.', hint: 'cut back on coffee' },
        { kr: '<span class="swap-hl">비밀번호를 재설정하려고</span> 하는데 잘 안 되네요.', en: 'I\'m trying to <span class="swap-hl">reset my password</span>, but it\'s not working.', hint: 'reset my password' },
        { kr: '이번 달엔 <span class="swap-hl">돈을 좀 아껴 쓰려고</span> 노력하고 있어.', en: 'I\'m trying to <span class="swap-hl">save some money</span> this month.', hint: 'save some money' }
      ]
    },
    {
      re: /^I was about to\b/i,
      frame: 'I was about to [ 막 ~하려던 찰나의 행동 ]',
      starter: 'I was about to ',
      swaps: [
        { kr: '마침 지금 막 <span class="swap-hl">너한테 전화하려던</span> 참이었어!', en: 'I was just about to <span class="swap-hl">call you</span>!', hint: 'call you' },
        { kr: '막 <span class="swap-hl">집에서 나가려던</span> 참인데 비가 오네.', en: 'I was about to <span class="swap-hl">leave the house</span> when it started raining.', hint: 'leave the house' },
        { kr: '방금 막 <span class="swap-hl">잠들려던</span> 참이었어.', en: 'I was just about to <span class="swap-hl">fall asleep</span>.', hint: 'fall asleep' }
      ]
    },
    {
      re: /^I'm here to\b/i,
      frame: 'I\'m here to [ 방문 목적 동사 ]',
      starter: 'I\'m here to ',
      swaps: [
        { kr: '<span class="swap-hl">주문한 픽업 음식 찾으러</span> 왔어요.', en: 'I\'m here to <span class="swap-hl">pick up my order</span>.', hint: 'pick up my order' },
        { kr: '<span class="swap-hl">김 매니저님 뵈러</span> 왔습니다.', en: 'I\'m here to <span class="swap-hl">see Manager Kim</span>.', hint: 'see Manager Kim' },
        { kr: '<span class="swap-hl">건강검진 받으러</span> 왔어요.', en: 'I\'m here to <span class="swap-hl">get a health checkup</span>.', hint: 'get a health checkup' }
      ]
    },
    {
      re: /^Let me\b/i,
      frame: 'Let me [ 내가 먼저 해줄 행동 ]',
      starter: 'Let me ',
      swaps: [
        { kr: '잠깐만요, 제가 <span class="swap-hl">일정 한번 확인해</span> 볼게요.', en: 'Let me <span class="swap-hl">check my schedule</span> real quick.', hint: 'check my schedule' },
        { kr: '오늘 점심은 <span class="swap-hl">제가 살게요</span>!', en: 'Let me <span class="swap-hl">get lunch today</span>!', hint: 'get lunch today' },
        { kr: '도착하면 <span class="swap-hl">바로 알려줄게</span>.', en: 'Let me <span class="swap-hl">know as soon as you arrive</span>.', hint: 'know as soon as you arrive' }
      ]
    },
    {
      re: /^Can I get/i,
      frame: 'Can I get [ 주문·요청할 물건 ]?',
      starter: 'Can I get ',
      swaps: [
        { kr: '<span class="swap-hl">아이스 아메리카노 테이크아웃으로</span> 하나 주시겠어요?', en: 'Can I get <span class="swap-hl">an iced Americano to go</span>, please?', hint: 'an iced Americano to go' },
        { kr: '혹시 <span class="swap-hl">영수증 좀</span> 받을 수 있을까요?', en: 'Can I get <span class="swap-hl">a receipt</span>, please?', hint: 'a receipt' },
        { kr: '<span class="swap-hl">창가 자리로</span> 앉을 수 있을까요?', en: 'Can I get <span class="swap-hl">a table by the window</span>?', hint: 'a table by the window' }
      ]
    },
    {
      re: /^Do you mind/i,
      frame: 'Do you mind [ ~ing / if I ~ ]?',
      starter: 'Do you mind ',
      swaps: [
        { kr: '실례지만 <span class="swap-hl">창문 좀 열어도</span> 괜찮을까요?', en: 'Do you mind <span class="swap-hl">if I open the window</span>?', hint: 'if I open the window' },
        { kr: '혹시 <span class="swap-hl">저희 사진 한 장만 찍어주실</span> 수 있나요?', en: 'Do you mind <span class="swap-hl">taking a quick photo for us</span>?', hint: 'taking a quick photo for us' },
        { kr: '<span class="swap-hl">조금만 천천히 말씀해</span> 주시겠어요?', en: 'Do you mind <span class="swap-hl">speaking a little slower</span>?', hint: 'speaking a little slower' }
      ]
    },
    {
      re: /^I'm not sure if|^I don't think|^I think you should/i,
      frame: 'I\'m not sure if / I think you should [ 의견·조언 ]',
      starter: 'I think you should ',
      swaps: [
        { kr: '<span class="swap-hl">오늘 제시간에 갈 수 있을지</span> 잘 모르겠어.', en: 'I\'m not sure if <span class="swap-hl">I can make it on time today</span>.', hint: 'I can make it on time' },
        { kr: '그건 <span class="swap-hl">그다지 좋은 생각은 아닌 것</span> 같아.', en: 'I don\'t think <span class="swap-hl">that\'s a great idea</span>.', hint: 'that\'s a great idea' },
        { kr: '오늘은 <span class="swap-hl">일찍 들어가서 좀 쉬는 게</span> 좋겠어.', en: 'I think you should <span class="swap-hl">go home early and rest</span>.', hint: 'go home early and rest' }
      ]
    },
    {
      re: /^Have you ever|^I used to/i,
      frame: 'Have you ever [ 경험 p.p. ]? / I used to [ 과거 습관 ]',
      starter: 'I used to ',
      swaps: [
        { kr: '혹시 <span class="swap-hl">혼자 해외여행 가본 적</span> 있어?', en: 'Have you ever <span class="swap-hl">traveled abroad alone</span>?', hint: 'traveled abroad alone' },
        { kr: '예전엔 <span class="swap-hl">이 근처에 살았었어</span>.', en: 'I used to <span class="swap-hl">live around here</span>.', hint: 'live around here' },
        { kr: '예전엔 <span class="swap-hl">아침을 늘 걸렀는데</span> 요즘은 챙겨 먹어.', en: 'I used to <span class="swap-hl">skip breakfast</span>, but now I eat every day.', hint: 'skip breakfast' }
      ]
    },
    {
      re: /^Would you like|^I'd rather|^I can't help/i,
      frame: 'I\'d rather [ 차라리 더 원하는 행동 ]',
      starter: 'I\'d rather ',
      swaps: [
        { kr: '밖에 나가기보단 <span class="swap-hl">차라리 집에서 영화 볼래</span>.', en: 'I\'d rather <span class="swap-hl">stay home and watch a movie</span>.', hint: 'stay home and watch a movie' },
        { kr: '<span class="swap-hl">따뜻한 차 한잔</span> 드릴까요?', en: 'Would you like <span class="swap-hl">a cup of warm tea</span>?', hint: 'a cup of warm tea' },
        { kr: '그 영상을 볼 때마다 <span class="swap-hl">웃음을 참을 수가 없어</span>.', en: 'I can\'t help <span class="swap-hl">laughing every time I watch it</span>.', hint: 'laughing every time I watch it' }
      ]
    },
    {
      re: /^What if|^I wish|^There's no way/i,
      frame: 'What if [ 만약 ~하면 어쩌지 ]? / I wish [ 바라는 상황 ]',
      starter: 'What if ',
      swaps: [
        { kr: '만약 우리가 <span class="swap-hl">막차를 놓치면</span> 어떡하지?', en: 'What if <span class="swap-hl">we miss the last train</span>?', hint: 'we miss the last train' },
        { kr: '내일이 <span class="swap-hl">금요일이면</span> 얼마나 좋을까!', en: 'I wish <span class="swap-hl">tomorrow were Friday</span>!', hint: 'tomorrow were Friday' },
        { kr: '그게 <span class="swap-hl">사실일 리가 절대 없어</span>!', en: 'There\'s no way <span class="swap-hl">that\'s true</span>!', hint: 'that\'s true' }
      ]
    },
    {
      re: /^It's not like|^I ended up|^I'm afraid|^Go ahead|^Never mind|^I'm done/i,
      frame: 'I ended up [ 결국 ~하게 된 행동~ing ] / I\'m done [ ~ing ]',
      starter: 'I ended up ',
      swaps: [
        { kr: '구경만 하려다가 <span class="swap-hl">결국 재킷까지 사버렸어</span>.', en: 'I ended up <span class="swap-hl">buying a jacket too</span>.', hint: 'buying a jacket too' },
        { kr: '먼저 <span class="swap-hl">식사 시작하세요</span>, 저 금방 갈게요!', en: 'Go ahead and <span class="swap-hl">start eating without me</span>!', hint: 'start eating without me' },
        { kr: '드디어 <span class="swap-hl">오늘 할 일 다 끝냈다</span>!', en: 'I\'m finally done <span class="swap-hl">with my work for today</span>!', hint: 'with my work for today' }
      ]
    }
  ];

  // Fallback smart structural frame detector so 100% of sentences get natural 3-swaps
  const STRUCTURAL_FALLBACKS = [
    {
      re: /^(Can you|Could you|Would you)\b/i,
      frame: 'Can / Could you [ 요청할 동작 ]?',
      starter: 'Can you ',
      swaps: [
        { kr: '시간 될 때 <span class="swap-hl">링크 좀 보내줄</span> 수 있어?', en: 'Can you <span class="swap-hl">send me the link</span> when you have a chance?', hint: 'send me the link' },
        { kr: '<span class="swap-hl">5분만 더 기다려</span> 주실 수 있나요?', en: 'Could you <span class="swap-hl">wait 5 more minutes</span>, please?', hint: 'wait 5 more minutes' },
        { kr: '가기 전에 <span class="swap-hl">한 번만 더 확인해</span> 줄래?', en: 'Can you <span class="swap-hl">double-check this</span> before we leave?', hint: 'double-check this' }
      ]
    },
    {
      re: /^(Do you|Did you|Have you|Are you)\b/i,
      frame: 'Do / Did / Have you [ 상대 경험·상태 질문 ]?',
      starter: 'Did you ',
      swaps: [
        { kr: '오늘 아침에 <span class="swap-hl">내가 보낸 메시지 확인했어</span>?', en: 'Did you <span class="swap-hl">check the message I sent</span> this morning?', hint: 'check the message I sent' },
        { kr: '혹시 <span class="swap-hl">우산 챙겨 왔어</span>?', en: 'Did you <span class="swap-hl">bring an umbrella</span> with you?', hint: 'bring an umbrella' },
        { kr: '지금 <span class="swap-hl">출발할 준비 다 됐어</span>?', en: 'Are you <span class="swap-hl">ready to head out</span> now?', hint: 'ready to head out' }
      ]
    },
    {
      re: /^(What|Where|When|Why|How)\b/i,
      frame: '의문사(What/Where/Why/How) + [ 핵심 질문 ]?',
      starter: 'What are you going to ',
      swaps: [
        { kr: '오늘 저녁엔 <span class="swap-hl">뭐 먹을 거야</span>?', en: 'What are you going to <span class="swap-hl">have for dinner tonight</span>?', hint: 'have for dinner tonight' },
        { kr: '<span class="swap-hl">그 정보는 어디서</span> 찾았어?', en: 'Where did you <span class="swap-hl">find that information</span>?', hint: 'find that information' },
        { kr: '거기까지 <span class="swap-hl">얼마나 걸려</span>?', en: 'How long does it <span class="swap-hl">take to get there</span>?', hint: 'take to get there' }
      ]
    },
    {
      re: /.*/,
      frame: '주어 + [ 핵심 결론 동사 ] + [ 내 일상 디테일 ]',
      starter: 'I\'m going to ',
      swaps: [
        { kr: '오늘 퇴근하고 <span class="swap-hl">가볍게 산책 좀 하려고</span> 해.', en: 'I\'m going to <span class="swap-hl">take a quick walk</span> after work today.', hint: 'take a quick walk' },
        { kr: '이 문제는 <span class="swap-hl">생각보다 훨씬 간단해</span>.', en: 'This is <span class="swap-hl">much simpler than I expected</span>.', hint: 'much simpler than I expected' },
        { kr: '내일 오전 중에 <span class="swap-hl">다시 연락드릴게요</span>.', en: 'I\'ll <span class="swap-hl">get back to you</span> tomorrow morning.', hint: 'get back to you' }
      ]
    }
  ];

  function cleanText(s) {
    return String(s || '').replace(/<[^>]+>/g, '').replace(/🔀\s*/g, '').replace(/\s+/g, ' ').trim();
  }

  // Generate 3 slot-swapped variations for any sentence or pattern card
  function getSwapSet(rawEn, rawKr, context = {}) {
    const plainEn = cleanText(rawEn);
    const searchTarget = (context.patternTitle ? context.patternTitle + ' ' : '') + plainEn;

    let rule = SWAP_BANK.find(r => r.re.test(searchTarget));
    if (!rule && context.chapterPattern) {
      rule = SWAP_BANK.find(r => r.re.test(context.chapterPattern));
    }
    if (!rule) {
      rule = STRUCTURAL_FALLBACKS.find(r => r.re.test(plainEn)) || STRUCTURAL_FALLBACKS[STRUCTURAL_FALLBACKS.length - 1];
    }

    // If inside Pattern 30, also blend 1 real sibling card from the same day if different!
    let variations = rule.swaps.filter(sw => cleanText(sw.en).toLowerCase() !== plainEn.toLowerCase());

    if (context.siblingCards && Array.isArray(context.siblingCards) && context.patternTitle) {
      const pTitle = context.patternTitle.replace(/\?$/, '').trim();
      const sibs = context.siblingCards
        .filter(c => cleanText(c.en).toLowerCase() !== plainEn.toLowerCase() && !c.kr.startsWith('🔀'))
        .slice(0, 3);
      if (sibs.length >= 2 && variations.length < 3) {
        for (const sb of sibs) {
          if (variations.length >= 3) break;
          const cEn = cleanText(sb.en);
          const cKr = cleanText(sb.kr);
          // Highlight the part after pattern prefix!
          const escP = pTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const hiEn = cEn.replace(new RegExp(`^(${escP}\\s+)(.+)$`, 'i'), '$1<span class="swap-hl">$2</span>');
          variations.push({
            kr: cKr,
            en: hiEn,
            hint: cEn.replace(new RegExp(`^${escP}\\s*`, 'i'), '')
          });
        }
      }
    }

    return {
      frame: context.patternTitle ? `${context.patternTitle} + [ 갈아끼울 내용 ]` : rule.frame,
      starter: rule.starter,
      swaps: variations.slice(0, 3)
    };
  }

  function getUserSwap(itemKey) {
    return _userSwaps[itemKey] || '';
  }

  function saveUserSwap(itemKey, text) {
    const v = String(text || '').trim();
    if (v) _userSwaps[itemKey] = v;
    else delete _userSwaps[itemKey];
    try {
      localStorage.setItem(USER_SWAP_KEY, JSON.stringify(_userSwaps));
    } catch (_) {}
  }

  function getAllCuratedSpokenPhrases() {
    const out = [];
    for (const r of [...SWAP_BANK, ...STRUCTURAL_FALLBACKS]) {
      for (const sw of r.swaps) out.push(sw.en);
    }
    return out;
  }

  return {
    getSwapSet,
    getUserSwap,
    saveUserSwap,
    getAllCuratedSpokenPhrases
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SlotSwapEngine };
}
