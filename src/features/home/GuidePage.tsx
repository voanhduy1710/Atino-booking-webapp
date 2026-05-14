import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

type GuideTab = 'create' | 'receiving'

/**
 * Combined guide page with subtabs, reachable at /guide
 * (individual /guide/create and /guide/receiving still work independently)
 */
export default function GuidePage() {
  const [tab, setTab] = useState<GuideTab>('create')

  useEffect(() => {
    document.title = 'HÆ°á»›ng dáº«n â€” Atino Booking'
  }, [])

  return (
    <div className="min-h-screen bg-[#fdf8ff]">
      {/* Header */}
      <div className="border-b border-[#d5c0d5] bg-white px-6 py-4 flex items-center gap-4 shadow-sm">
        <Link to="/" className="text-black font-bold hover:text-white transition-colors text-sm">
          â† Quay láº¡i
        </Link>
        <img src="/Atino Logo.svg" alt="Atino" className="h-6 w-auto" />
      </div>

      {/* Subtabs */}
      <div className="border-b border-[#d5c0d5] bg-white px-6">
        <div className="flex gap-0 max-w-3xl mx-auto">
          <button
            onClick={() => setTab('create')}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${tab === 'create'
                ? 'border-[#bf2ef0] bg-[#bf2ef0] text-white font-bold'
                : 'border-transparent text-[#514253] font-bold hover:bg-[#f1ebf4] hover:text-[#bf2ef0]'
              }`}
          >
            Quy trÃ¬nh Ä‘Äƒng kÃ½
          </button>
          <button
            onClick={() => setTab('receiving')}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${tab === 'receiving'
                ? 'border-[#bf2ef0] bg-[#bf2ef0] text-white font-bold'
                : 'border-transparent text-[#514253] font-bold hover:bg-[#f1ebf4] hover:text-[#bf2ef0]'
              }`}
          >
            Quy trÃ¬nh nháº­n hÃ ng
          </button>
        </div>
      </div>

      {/* Content â€” strip the outer wrapper from each guide */}
      <div>
        {tab === 'create' ? (
          <GuideCreateContent />
        ) : (
          <GuideReceivingContent />
        )}
      </div>
    </div>
  )
}

// â”€â”€ Inline content components (reuse logic without the outer page chrome) â”€â”€â”€â”€â”€â”€

function GuideCreateContent() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-2">HÆ°á»›ng dáº«n táº¡o Ä‘Æ¡n Ä‘Äƒng kÃ½ giao hÃ ng</h1>
      <p className="text-[#888888] text-sm mb-8">
        LÃ m theo cÃ¡c bÆ°á»›c dÆ°á»›i Ä‘Ã¢y Ä‘á»ƒ Ä‘Äƒng kÃ½ giao hÃ ng thÃ nh cÃ´ng.
      </p>
      <div className="space-y-8">
        {[
          { step: 1, title: 'ÄÄƒng nháº­p tÃ i khoáº£n', desc: 'Sá»­ dá»¥ng tÃªn Ä‘Äƒng nháº­p vÃ  máº­t kháº©u Ä‘Æ°á»£c cáº¥p. Náº¿u chÆ°a cÃ³ tÃ i khoáº£n, vui lÃ²ng Ä‘Äƒng kÃ½ vÃ  chá» admin xÃ¡c nháº­n.' },
          { step: 2, title: 'Chá»n kho vÃ  Ä‘iá»n thÃ´ng tin nhÃ  cung cáº¥p', desc: 'Chá»n kho hÃ ng tá»« dropdown. MÃ£ NCC vÃ  TÃªn NCC Ä‘Æ°á»£c tá»± Ä‘á»™ng Ä‘iá»n tá»« tÃ i khoáº£n cá»§a báº¡n.' },
          { step: 3, title: 'Nháº­p sá»‘ lÆ°á»£ng Ä‘Æ¡n hÃ ng (PO)', desc: 'Nháº­p sá»‘ lÆ°á»£ng Ä‘Æ¡n hÃ ng (1â€“99). Há»‡ thá»‘ng sáº½ táº¡o ra sá»‘ hÃ ng tÆ°Æ¡ng á»©ng trong báº£ng Ä‘Æ¡n hÃ ng.' },
          { step: 4, title: 'Äiá»n thÃ´ng tin tá»«ng Ä‘Æ¡n hÃ ng', desc: 'Cho má»—i hÃ ng: nháº­p MÃ£ sáº£n pháº©m â€” MÃ£ quy trÃ¬nh, chá»n Sá»‘ láº§n giao, nháº­p Sá»‘ kiá»‡n/thÃ¹ng, táº£i lÃªn áº£nh phiáº¿u giao. Náº¿u Ä‘Ã¢y lÃ  láº§n giao Ä‘áº§u tiÃªn (Sá»‘ láº§n giao = 1), báº¯t buá»™c pháº£i táº£i lÃªn HÃ³a Ä‘Æ¡n VAT.' },
          { step: 5, title: 'Chá»n khung giá» giao hÃ ng', desc: 'Chá»n má»™t trong bá»‘n khung giá»: 07:00â€“09:00, 09:00â€“11:00, 13:30â€“15:30, 15:30â€“17:00. ÄÆ¡n hÃ ng Ä‘Äƒng kÃ½ trÆ°á»›c 18:00 sáº½ giao ngÃ y N+1, tá»« 18:00 trá»Ÿ Ä‘i sáº½ giao ngÃ y N+2.' },
          { step: 6, title: 'Gá»­i Ä‘Äƒng kÃ½ vÃ  lÆ°u mÃ£ QR', desc: 'Nháº¥n "ÄÄƒng kÃ½". Sau khi thÃ nh cÃ´ng, báº¡n sáº½ nháº­n Ä‘Æ°á»£c mÃ£ booking vÃ  mÃ£ QR. Vui lÃ²ng lÆ°u hoáº·c in mÃ£ QR Ä‘á»ƒ sá»­ dá»¥ng khi giao hÃ ng táº¡i kho.' },
        ].map(({ step, title, desc }) => (
          <div key={step} className="flex gap-5">
            <div className="flex-shrink-0 w-9 h-9 rounded-full border-2 border-black flex items-center justify-center font-bold text-sm">{step}</div>
            <div>
              <h2 className="font-semibold mb-1">{title}</h2>
              <p className="text-[#888888] text-sm leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-10 pt-6 border-t border-[#ecdbe8]">
        <Link to="/login" className="btn-primary inline-flex" id="guide-go-to-login">
          ÄÄƒng nháº­p Ä‘á»ƒ Ä‘Äƒng kÃ½ giao hÃ ng
        </Link>
      </div>
    </div>
  )
}

function GuideReceivingContent() {
  // Import inline from GuideReceiving page body
  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-2">HÆ°á»›ng dáº«n nháº­n hÃ ng táº¡i kho</h1>
      <p className="text-[#888888] text-sm mb-8">
        Quy trÃ¬nh nháº­n hÃ ng tá»« nhÃ  cung cáº¥p táº¡i kho Atino.
      </p>
      <div className="bg-[#F5F5F5] border border-[#ecdbe8] rounded-lg p-5 text-sm text-[#888888] text-center">
        Ná»™i dung hÆ°á»›ng dáº«n nháº­n hÃ ng Ä‘ang Ä‘Æ°á»£c cáº­p nháº­t.{' '}
        <Link to="/guide/receiving" className="underline hover:text-black">
          Xem trang Ä‘áº§y Ä‘á»§ â†’
        </Link>
      </div>
    </div>
  )
}
