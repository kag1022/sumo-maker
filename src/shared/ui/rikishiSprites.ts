export const PIXEL_COLORS: Record<string, string> = {
  ' ': 'transparent',
  'k': '#f5c9a4', // Skin base
  'K': '#e0a67a', // Skin shadow
  'h': '#ffdbb5', // Skin highlight
  'b': '#2d2926', // Black (Hair / Belt)
  'B': '#1a1715', // Darker black
  'w': '#ffffff', // White (eyes/details)
  'r': '#c43a31', // Red (decorations, if any)
};

type Matrix = string[];

export const SPRITE_MATRICES: Record<string, Record<'front' | 'back', Matrix>> = {
  NORMAL: {
    front: [
      "        bb        ",
      "       bbbb       ",
      "      hkkkKb      ", // face
      "      k bw b      ", // eyes
      "      kkkkkk      ", // face
      "    bbKkkkkKbb    ", // shoulders
      "   bb KkkkkK bb   ", // chest
      "   kK kkkkkk Kk   ", // arms / body
      "   kK KkkkkK Kk   ", // belly
      "   kk kkkkkk kk   ",
      "   kK kkkkkk Kk   ", // belly bottom
      "   kkk bbbb kkk   ", // mawashi top
      "    k  bbbb  k    ", // mawashi front knot area
      "       bbbb       ",
      "      kk  kk      ", // legs
      "      kk  kk      ",
      "      kk  kk      ",
      "     kkk  kkk     ", // feet
    ],
    back: [
      "        b         ", // topknot
      "       bbbb       ", // hair
      "      bbbbbb      ", // back of head
      "      bbbbbb      ",
      "      kkkkkk      ", // neck
      "    kkkkkkkkkk    ", // shoulders
      "   kk kkkkkk kk   ", // back
      "   kk kkkkkk kk   ",
      "   kk kkkkkk kk   ",
      "   kk kkkkkk kk   ",
      "   kk kkkkkk kk   ",
      "   kkk bbbb kkk   ", // mawashi back
      "    k k bb k k    ",
      "      k bb k      ",
      "      kk  kk      ", // legs
      "      kk  kk      ",
      "      kk  kk      ",
      "     kkk  kkk     ", // feet
    ]
  },
  SOPPU: {
    front: [
      "        bb        ",
      "       bbbb       ",
      "      hkkkKb      ",
      "      k bw b      ",
      "      kkkkkk      ",
      "      kkkkkk      ", // slender shoulders
      "   b  KkkkkK  b   ", // slim chest
      "   kK kkkkkk Kk   ", // arms / slim body
      "   kK kkkkkk Kk   ",
      "   kk kKkkKk kk   ", // showing ribs/abs a bit
      "   kK kkkkkk Kk   ",
      "   kkk bbbb kkk   ",
      "    k  bbbb  k    ",
      "       bbbb       ",
      "      kk  kk      ",
      "      kk  kk      ",
      "      kk  kk      ",
      "     kkk  kkk     ",
    ],
    back: [
      "        b         ",
      "       bbbb       ",
      "      bbbbbb      ",
      "      bbbbbb      ",
      "      kkkkkk      ",
      "      kkkkkk      ", // slender 
      "   kk KkkkkK kk   ", // back bones visible slightly via shadow
      "   kk kkkkkk kk   ",
      "   kk kkkkkk kk   ",
      "   kk kKkkKk kk   ",
      "   kk kkkkkk kk   ",
      "   kkk bbbb kkk   ",
      "    k k bb k k    ",
      "      k bb k      ",
      "      kk  kk      ",
      "      kk  kk      ",
      "      kk  kk      ",
      "     kkk  kkk     ",
    ]
  },
  ANKO: {
    front: [
      "        bb        ",
      "       bbbb       ",
      "      hkkkKbb     ",
      "     hk bw bK     ", // chubby cheeks
      "     hkkkkkkK     ",
      "   bbbbkkkkbbbb   ", // wide shoulders
      "  bbKkkkkkkkkKbb  ", // round chest
      "  kKkkkkkkkkkkKk  ", // wide arms / huge belly
      "  kKkkkkkkkkkkKk  ",
      "  kkkkkkkkkkkkkk  ",
      "  kKkkkkkkkkkkKk  ",
      "  kkkk bbbbbb kkk ",
      "   kk  bbbbbb  k  ",
      "       bbbbbb     ",
      "      kkk  kkk    ", // thicker legs
      "      kkk  kkk    ",
      "      kkk  kkk    ",
      "     kkkk  kkkk   ",
    ],
    back: [
      "        b         ",
      "       bbbb       ",
      "      bbbbbb      ",
      "     bbbbbbbb     ",
      "     kkkkkkkk     ",
      "   kkkkkkkkkkkk   ",
      "  kkkkkkkkkkkkkk  ",
      "  kkkkkkkkkkkkkk  ",
      "  kkkkkkkkkkkkkk  ",
      "  kkkkkkkkkkkkkk  ",
      "  kkkkkkkkkkkkkk  ",
      "  kkkk bbbbbb kkk ",
      "   kk k bbbb k k  ",
      "      k bbbb k    ",
      "      kkk  kkk    ",
      "      kkk  kkk    ",
      "      kkk  kkk    ",
      "     kkkk  kkkk   ",
    ]
  },
  MUSCULAR: {
    front: [
      "        bb        ",
      "       bbbb       ",
      "      hkkkKb      ",
      "      k bw b      ",
      "      kkkkkk      ",
      "    bbKkkkkKbb    ", // strong shoulders
      "   bb KkKkKk bb   ", // pecs
      "   kK KkkkkK Kk   ", // arms / body
      "   kK kKkkKk Kk   ", // abs 1
      "   kk kkKkKk kk   ", // abs 2
      "   kK kKkkKk Kk   ", // abs 3
      "   kkk bbbb kkk   ",
      "    k  bbbb  k    ",
      "       bbbb       ",
      "      kK  Kk      ", // strong legs
      "      kk  kk      ",
      "      kk  kk      ",
      "     kkk  kkk     ",
    ],
    back: [
      "        b         ", // topknot
      "       bbbb       ", // hair
      "      bbbbbb      ", // back of head
      "      bbbbbb      ",
      "      kkkkkk      ", // neck
      "    kkkkkkkkkk    ", // wide shoulders
      "   kk KkKkKk kk   ", // back muscles
      "   kk kKkkKk kk   ",
      "   kk kKkkKk kk   ",
      "   kk KkKkKk kk   ",
      "   kk kkkkkk kk   ",
      "   kkk bbbb kkk   ", // mawashi back
      "    k k bb k k    ",
      "      k bb k      ",
      "      kK  Kk      ", // strong legs
      "      kk  kk      ",
      "      kk  kk      ",
      "     kkk  kkk     ", // feet
    ]
  }
};

export const matrixToSvgDataUri = (matrix: Matrix, pixelSize = 8): string => {
  const width = matrix[0].length;
  const height = matrix.length;
  const svgWidth = width * pixelSize;
  const svgHeight = height * pixelSize;

  let rects = '';
  // Optimization: consecutive pixels of same color can be merged into wider rects
  for (let y = 0; y < height; y++) {
    let currentX = 0;
    while (currentX < width) {
      const char = matrix[y][currentX];
      if (char !== ' ') {
        let xSpan = 1;
        while (currentX + xSpan < width && matrix[y][currentX + xSpan] === char) {
          xSpan++;
        }
        const color = PIXEL_COLORS[char] || PIXEL_COLORS['k'];
        rects += `<rect x="${currentX * pixelSize}" y="${y * pixelSize}" width="${xSpan * pixelSize}" height="${pixelSize}" fill="${color}" />`;
        currentX += xSpan;
      } else {
        currentX++;
      }
    }
  }

  const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%" height="100%">
    ${rects}
  </svg>`;

  // Base64 encode for src attribute
  const encoded = typeof window !== 'undefined' ? window.btoa(svgStr) : Buffer.from(svgStr).toString('base64');
  return `data:image/svg+xml;base64,${encoded}`;
};
