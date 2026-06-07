const newsItems = [
  {
    date: "December 5, 2025",
    title:
      "PRECIOUS CORNERSTONE UNIVERSITY, IBADAN, BREAKING NEWS!!! 50% TUITION OFF FOR HIGH-VALUE DEGREES!",
    bg: "bg-gray-700",
    isImage: false,
  },
  {
    date: "",
    title: "PRECIOUS CORNERSTONE UNIVERSITY",
    bg: "bg-gray-500",
    isImage: true,
  },
  {
    date: "October 24, 2025",
    title:
      "PRECIOUS CORNERSTONE UNIVERSITY, IBADAN 4th Convocation Ceremony",
    bg: "bg-gray-800",
    isImage: false,
  },
  {
    date: "October 7, 2025",
    title:
      "PRECIOUS CORNERSTONE UNIVERSITY, IBADAN SPECIAL RELEASE RESUMPTION FOR 2025/2026 ACADEMIC SESSION",
    bg: "bg-gray-700",
    isImage: false,
  },
  {
    date: "October 7, 2025",
    title: "SCHEDULE OF SCHOOL FEES",
    bg: "bg-gray-600",
    isImage: true,
    overlay: "LET THERE BE LIGHT",
  },
  {
    date: "October 7, 2025",
    title: "AFFIDAVIT OF GOOD CONDUCT",
    bg: "bg-gray-800",
    isImage: false,
  },
];

function NewsCard({ item }: { item: any }) {
  if (item.isImage) {
    return (
      <div
        className={`${item.bg} relative min-h-[140px] flex items-center justify-center overflow-hidden cursor-pointer group transition-all duration-500 hover:shadow-2xl hover:-translate-y-1`}
      >
        {/* Subtle zoom overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-500 z-10" />
        
        {item.overlay && (
          <p className="text-white/20 text-xs font-black tracking-[6px] uppercase text-center px-2 z-20 transition-all duration-700 group-hover:scale-125 group-hover:text-white/40">
            {item.overlay}
          </p>
        )}
        {!item.overlay && (
          <p
            className="text-white/30 text-[7px] font-black tracking-[5px] uppercase text-center z-20 transition-all duration-700 group-hover:scale-110 group-hover:text-white/50"
            style={{ writingMode: "vertical-rl" }}
          >
            {item.title}
          </p>
        )}
        {item.date && (
          <span className="absolute bottom-2 left-3 text-white/50 text-[10px] z-20 transition-transform duration-500 group-hover:translate-x-1">
            {item.date}
          </span>
        )}

        {/* Floating Accent */}
        <div className="absolute top-0 right-0 w-8 h-8 bg-white/10 -rotate-45 translate-x-4 -translate-y-4 group-hover:translate-x-2 group-hover:-translate-y-2 transition-transform duration-500" />
      </div>
    );
  }

  return (
    <div
      className={`${item.bg} text-white p-4 min-h-[140px] flex flex-col justify-end cursor-pointer group transition-all duration-500 hover:shadow-2xl hover:-translate-y-1 relative overflow-hidden`}
    >
      {/* Glossy overlay effect */}
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
      
      {item.date && (
        <p className="text-white/55 text-[10px] mb-1 transition-transform duration-500 group-hover:translate-x-1">{item.date}</p>
      )}
      <p className="text-white text-xs font-bold leading-snug uppercase tracking-[0.3px] transition-transform duration-500 group-hover:translate-x-1">
        {item.title}
      </p>
    </div>
  );
}

export default function OtherNews() {
  return (
    <div className=" py-12">
      <h2 className="text-xl font-bold text-gray-800 mb-6 pl-4">Other News</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {newsItems.map((item, i) => (
          <NewsCard key={i} item={item} />
        ))}
      </div>
    </div>
  );
}
