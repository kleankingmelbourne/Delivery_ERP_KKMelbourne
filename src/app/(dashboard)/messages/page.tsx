"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { Search, Send, User, MessageSquare, Loader2, CheckCheck, Plus, X, Building2 } from "lucide-react";

type Message = {
  id: string;
  customer_id: string;
  sender_type: "customer" | "admin";
  content: string;
  is_read: boolean;
  created_at: string;
  customers?: {
    name: string;
    company: string;
  };
};

type SearchedCustomer = {
  id: string;
  name: string;
  company: string;
};

export default function AdminInboxPage() {
  const supabase = createClient();
  
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState("");
  const [searchedCustomers, setSearchedCustomers] = useState<SearchedCustomer[]>([]);
  const [tempCustomer, setTempCustomer] = useState<SearchedCustomer | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMessages();

    const channel = supabase
      .channel(`admin-inbox-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => {
          fetchMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from("messages")
      .select(`
        *,
        customers:customer_id (name, company)
      `)
      .order("created_at", { ascending: true });

    if (!error && data) {
      setAllMessages(data as Message[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!isNewModalOpen || newChatSearch.trim().length < 2) {
      setSearchedCustomers([]);
      return;
    }

    const searchTimer = setTimeout(async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, name, company')
        .or(`name.ilike.%${newChatSearch}%,company.ilike.%${newChatSearch}%`)
        .limit(10);
      
      if (data) setSearchedCustomers(data as SearchedCustomer[]);
    }, 300);

    return () => clearTimeout(searchTimer);
  }, [newChatSearch, isNewModalOpen, supabase]);

  const chatRooms = useMemo(() => {
    const roomsMap = new Map<string, any>();

    allMessages.forEach((msg) => {
      if (!roomsMap.has(msg.customer_id)) {
        roomsMap.set(msg.customer_id, {
          customer_id: msg.customer_id,
          customer: msg.customers, 
          unreadCount: 0,
          lastMessage: null,
        });
      }
      const room = roomsMap.get(msg.customer_id);
      room.lastMessage = msg;
      
      if (msg.sender_type === "customer" && !msg.is_read) {
        room.unreadCount += 1;
      }
    });

    return Array.from(roomsMap.values())
      .filter(room => 
        room.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        room.customer?.company?.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime());
  }, [allMessages, searchTerm]);

  const currentChat = useMemo(() => {
    if (!selectedCustomerId) return [];
    return allMessages.filter((msg) => msg.customer_id === selectedCustomerId);
  }, [allMessages, selectedCustomerId]);

  useEffect(() => {
    if (selectedCustomerId) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      
      const markAsRead = async () => {
        await supabase
          .from("messages")
          .update({ is_read: true })
          .eq("customer_id", selectedCustomerId)
          .eq("sender_type", "customer")
          .eq("is_read", false);
          
        fetchMessages();
      };
      markAsRead();
    }
  }, [selectedCustomerId, currentChat.length]);

  // 5. 관리자 메시지 전송
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedCustomerId) return;

    const content = replyText.trim();
    setReplyText("");

    try {
      const { data, error } = await supabase.from("messages").insert([
        {
          customer_id: selectedCustomerId,
          sender_type: "admin",
          content: content,
          is_read: false,
          created_at: new Date().toISOString() // 🚀 원인 1 차단: 시간 강제 주입
        },
      ]).select(); // 🚀 핵심: select()를 붙여야 Supabase가 에러를 정확하게 뱉어냅니다.

      if (error) {
        // 에러 상세 내용을 콘솔에 강제로 예쁘게 출력
        console.error("Supabase Error Details:", JSON.stringify(error, null, 2));
        
        // 사장님이 보실 수 있게 화면에 팝업 띄우기
        alert(`❌ 메시지 전송 실패!\n사유: ${error.message || '데이터베이스 권한/설정 오류입니다. 콘솔창을 확인해주세요.'}`);
      } else {
        // 성공 시 리스트 새로고침
        fetchMessages();
      }
    } catch (err: any) {
      console.error("Catch Error:", err);
      alert(`시스템 에러: ${err.message}`);
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return <div className="flex h-[80vh] items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;
  }

  const currentRoom = chatRooms.find(r => r.customer_id === selectedCustomerId);
  
  const displayTitle = currentRoom?.customer?.company || tempCustomer?.company || currentRoom?.customer?.name || tempCustomer?.name || "Unknown Customer";
  const displaySubtitle = (currentRoom?.customer?.company && currentRoom?.customer?.name) 
    ? currentRoom.customer.name 
    : (tempCustomer?.company && tempCustomer?.name ? tempCustomer.name : "");

  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-6 h-[calc(100vh-80px)] flex flex-col">
      
      <div className="mb-4">
        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-indigo-600" /> Customer Inbox
        </h1>
      </div>

      <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex relative">
        
        {/* 왼쪽 패널 */}
        <div className="w-full md:w-1/3 lg:w-1/4 border-r border-slate-200 flex flex-col bg-slate-50/50 z-10">
          <div className="p-4 border-b border-slate-200 bg-white space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search company or name..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-100 border-transparent rounded-xl text-sm focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all outline-none"
                />
              </div>
              <button 
                onClick={() => setIsNewModalOpen(true)} 
                className="bg-indigo-600 text-white p-2 rounded-xl hover:bg-indigo-700 transition-all shadow-sm flex items-center justify-center w-10 shrink-0"
                title="Start New Conversation"
              >
                <Plus className="w-5 h-5"/>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {chatRooms.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm font-bold">No messages yet.</div>
            ) : (
              chatRooms.map((room) => {
                const roomTitle = room.customer?.company || room.customer?.name || "Unknown Customer";
                return (
                  <button
                    key={room.customer_id}
                    onClick={() => {
                      setSelectedCustomerId(room.customer_id);
                      setTempCustomer(null);
                    }}
                    className={`w-full text-left p-4 flex items-start gap-3 border-b border-slate-100 transition-all ${
                      selectedCustomerId === room.customer_id 
                      ? "bg-indigo-50 border-l-4 border-l-indigo-600" 
                      : "hover:bg-white border-l-4 border-l-transparent"
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0">
                      {room.customer?.company ? <Building2 className="w-4 h-4"/> : <User className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-black text-slate-900 text-sm truncate">
                          {roomTitle}
                        </h4>
                        <span className="text-[10px] font-bold text-slate-400 flex-shrink-0">
                          {formatTime(room.lastMessage.created_at)}
                        </span>
                      </div>
                      <p className={`text-xs truncate ${room.unreadCount > 0 ? "text-slate-800 font-bold" : "text-slate-500 font-medium"}`}>
                        {room.lastMessage.sender_type === "admin" ? "You: " : ""}
                        {room.lastMessage.content}
                      </p>
                    </div>
                    {room.unreadCount > 0 && (
                      <div className="w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 shadow-sm">
                        {room.unreadCount}
                      </div>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* 오른쪽 대화창 패널 */}
        <div className="hidden md:flex flex-1 flex-col bg-white z-0">
          {!selectedCustomerId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-3">
              <MessageSquare className="w-12 h-12 text-slate-200" />
              <p className="font-bold">Select a customer to view messages</p>
              <button 
                onClick={() => setIsNewModalOpen(true)}
                className="mt-2 text-indigo-600 text-sm font-bold hover:underline"
              >
                Or start a new conversation
              </button>
            </div>
          ) : (
            <>
              {/* 🚀 채팅방 헤더 영역 (닫기 버튼 추가) */}
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center">
                    {(currentRoom?.customer?.company || tempCustomer?.company) ? <Building2 className="w-4 h-4"/> : <User className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900">
                      {displayTitle}
                    </h3>
                    {displaySubtitle && (
                      <p className="text-xs text-slate-500 font-medium">
                        {displaySubtitle}
                      </p>
                    )}
                  </div>
                </div>
                
                {/* 🚀 닫기 버튼 */}
                <button 
                  onClick={() => {
                    setSelectedCustomerId(null);
                    setTempCustomer(null);
                  }}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors outline-none"
                  title="Close Chat"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/30">
                {currentChat.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm">
                    <p className="font-bold">No messages yet.</p>
                    <p>Send the first message to start the conversation!</p>
                  </div>
                ) : (
                  currentChat.map((msg) => {
                    const isAdmin = msg.sender_type === "admin";
                    return (
                      <div key={msg.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                        <div className="flex flex-col gap-1 max-w-[70%]">
                          <div 
                            className={`px-4 py-2.5 text-sm shadow-sm ${
                              isAdmin 
                              ? "bg-slate-900 text-white rounded-2xl rounded-tr-sm" 
                              : "bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-tl-sm"
                            }`}
                          >
                            {msg.content}
                          </div>
                          <div className={`flex items-center gap-1 text-[10px] font-bold text-slate-400 ${isAdmin ? "justify-end pr-1" : "justify-start pl-1"}`}>
                            {formatTime(msg.created_at)}
                            {isAdmin && (
                              <CheckCheck className={`w-3 h-3 ${msg.is_read ? "text-blue-500" : "text-slate-300"}`} />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-4 bg-white border-t border-slate-200">
                <form onSubmit={handleSendReply} className="flex gap-2">
                  <input 
                    type="text" 
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type your reply to the customer..." 
                    className="flex-1 bg-slate-100 border-transparent text-sm px-4 py-3 rounded-xl focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all outline-none"
                  />
                  <button 
                    type="submit" 
                    disabled={!replyText.trim()}
                    className="px-5 bg-indigo-600 disabled:bg-slate-300 text-white font-bold rounded-xl flex items-center justify-center hover:bg-indigo-700 transition-all shadow-sm"
                  >
                    <Send className="w-4 h-4 mr-2" /> Send
                  </button>
                </form>
              </div>
            </>
          )}
        </div>

        {/* 새 대화 시작 모달 */}
        {isNewModalOpen && (
          <div className="absolute inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl relative animate-in zoom-in-95">
              <button 
                onClick={() => {
                  setIsNewModalOpen(false);
                  setNewChatSearch("");
                }} 
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-900 transition-colors p-1 outline-none"
              >
                <X className="w-5 h-5"/>
              </button>
              
              <h2 className="text-xl font-black text-slate-900 mb-2">New Conversation</h2>
              <p className="text-xs text-slate-500 mb-4 font-medium">Search for a company or name.</p>
              
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  autoFocus
                  value={newChatSearch} 
                  onChange={e => setNewChatSearch(e.target.value)} 
                  placeholder="Type company or name..." 
                  className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all outline-none font-medium"
                />
              </div>

              <div className="max-h-[300px] overflow-y-auto space-y-1 custom-scrollbar">
                {searchedCustomers.map(c => (
                  <button 
                    key={c.id} 
                    onClick={() => {
                      setSelectedCustomerId(c.id);
                      setTempCustomer(c);
                      setIsNewModalOpen(false);
                      setNewChatSearch("");
                    }} 
                    className="w-full text-left p-3 hover:bg-indigo-50 rounded-xl border border-transparent transition-all flex items-center gap-3 group"
                  >
                    <div className="w-10 h-10 bg-slate-100 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600 rounded-full flex items-center justify-center transition-colors">
                      {c.company ? <Building2 className="w-4 h-4"/> : <User className="w-5 h-5"/>}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{c.company || c.name}</div>
                      {c.company && <div className="text-xs text-slate-500 font-medium">{c.name}</div>}
                    </div>
                  </button>
                ))}
                
                {newChatSearch.length >= 2 && searchedCustomers.length === 0 && (
                  <div className="text-center text-sm text-slate-400 py-8 font-medium">
                    No customers found matching "{newChatSearch}".
                  </div>
                )}
                {newChatSearch.length < 2 && (
                  <div className="text-center text-sm text-slate-400 py-8 font-medium">
                    Type at least 2 characters to search.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}