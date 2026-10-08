import { useRef, useState } from 'react'
import { FileText, Image as ImageIcon, Menu, MessageSquarePlus, Paperclip, Send, Trash2, X } from 'lucide-react'

const starter = [
  'What does the SOP say about missing information?',
  'Help me identify the correct report role.',
  'Show the source and page for your answer.'
]

export default function App(){
  const [messages,setMessages]=useState([])
  const [text,setText]=useState('')
  const [file,setFile]=useState(null)
  const [open,setOpen]=useState(false)
  const inputRef=useRef(null)

  function send(value=text){
    const question=value.trim()
    if(!question && !file) return
    setMessages(m=>[...m,{role:'user',text:question||'Please review this attachment.',file:file?.name}])
    setText(''); setFile(null)
    setTimeout(()=>setMessages(m=>[...m,{role:'bot',text:'This is a frontend demo response. Connect this screen to your coworker’s Python API to return answers grounded in the SOP.',sources:[{name:'Sample SOP.pdf',page:'Page 1'}]}]),650)
  }

  return <div className="app">
    <aside className={open?'open':''}>
      <div className="brand"><img src="/tabwink-logo.jpg"/><div><strong>TabWink</strong><span>Digital Keying Assistant</span></div></div>
      <button className="new" onClick={()=>{setMessages([]);setOpen(false)}}><MessageSquarePlus size={18}/> New chat</button>
      <p className="side-title">RECENT</p>
      <div className="recent">No saved conversations yet</div>
      <div className="aside-bottom"><div className="status"><i/> SOP assistant ready</div><small>Prototype UI<br/>Verify answers against the cited SOP.</small></div>
    </aside>
    {open&&<button className="overlay" onClick={()=>setOpen(false)}/>} 
    <main>
      <header><button className="menu" onClick={()=>setOpen(true)}><Menu/></button><div><b>TabWink</b><span>Your Digital Keying Assistant</span></div><button className="clear" onClick={()=>setMessages([])}><Trash2 size={16}/> Clear</button></header>
      <section className="chat">
        {messages.length===0?<div className="welcome">
          <img src="/tabwink-logo.jpg" alt="TabWink logo"/>
          <h1>How can TabWink help?</h1>
          <p>Ask a question about your division's SOPs or attach a document or report image.</p>
          <div className="cards">{starter.map(s=><button key={s} onClick={()=>send(s)}>{s}<Send size={15}/></button>)}</div>
        </div>:<div className="thread">{messages.map((m,i)=><div key={i} className={`message ${m.role}`}>
          <div className="avatar">{m.role==='bot'?<img src="/tabwink-logo.jpg"/>:'You'}</div>
          <div className="bubble"><b>{m.role==='bot'?'TabWink':'You'}</b><p>{m.text}</p>{m.file&&<div className="attached"><Paperclip size={14}/>{m.file}</div>}{m.sources?.map((s,j)=><div className="source" key={j}><FileText size={17}/><div><strong>{s.name}</strong><span>{s.page}</span></div></div>)}</div>
        </div>)}</div>}
      </section>
      <footer>
        {file&&<div className="file-preview">{file.type.startsWith('image/')?<ImageIcon/>:<FileText/>}<div><b>{file.name}</b><span>{Math.ceil(file.size/1024)} KB</span></div><button onClick={()=>setFile(null)}><X/></button></div>}
        <div className="composer"><button onClick={()=>inputRef.current?.click()} title="Attach file or photo"><Paperclip/></button><input ref={inputRef} hidden type="file" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg" onChange={e=>setFile(e.target.files?.[0]||null)}/><textarea rows="1" placeholder="Ask TabWink about an SOP..." value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}/><button className="send" onClick={()=>send()} disabled={!text.trim()&&!file}><Send/></button></div>
        <small>TabWink can make mistakes. Verify important answers against the cited SOP.</small>
      </footer>
    </main>
  </div>
}
