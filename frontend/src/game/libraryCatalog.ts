import { getLibraryCategory, LIBRARY_BOOKS, type LibraryCategoryId, type LibrarySession } from './librarySession';

export function getLibraryCatalogEntries(session: LibrarySession, query = '', categoryId: LibraryCategoryId | null = null) {
  const search = query.trim().replace(/\s+/g, '').toLocaleLowerCase();
  return LIBRARY_BOOKS.filter(book => (!categoryId || book.categoryId === categoryId)
    && (!search || `${book.title}${book.callNumber}${getLibraryCategory(book.categoryId).label}`.replace(/\s+/g, '').toLocaleLowerCase().includes(search)))
    .map(book => {
      const assigned = session.books.find(item => item.bookId === book.id);
      const withVisitor = !assigned && session.visitors.some(visitor => visitor.bookId === book.id && visitor.requestType === 'shelve');
      const location = withVisitor ? '이용자가 읽고 있는 책'
        : assigned?.location === 'return-cart' ? '반납 카트'
        : assigned?.location === 'carried' ? '내가 가지고 있음'
          : assigned?.location === 'handoff' ? '사서 확인함'
            : `${getLibraryCategory(assigned?.shelfId ?? book.categoryId).label} 서가`;
      return { book, location, available: !withVisitor && (!assigned || (assigned.location === 'shelf' && assigned.shelfId === book.categoryId)) };
    }).sort((a, b) => a.book.callNumber.localeCompare(b.book.callNumber, 'ko', { numeric: true }) || a.book.title.localeCompare(b.book.title, 'ko'));
}

export const LIBRARY_WORK_GUIDE = [
  { title: '업무 받기', icon: 'chatbubble-ellipses-outline', steps: ['사서에게 오늘 맡을 일을 확인해요.', '반납 처리가 끝난 책만 정리해요.', '카트의 책은 한 번에 6권씩 가져와요.'] },
  { title: '책등 라벨 읽기', icon: 'pricetag-outline', steps: ['책등 아래의 청구기호를 확인해요.', '윗줄은 분류번호, 아랫줄은 도서기호예요.', '480은 400 자연과학 서가에서 찾아요.'] },
  { title: '서가에 꽂기', icon: 'library-outline', steps: ['분류번호와 서가의 번호를 맞춰요.', '실제 서가는 번호가 작은 순서로, 왼쪽에서 오른쪽·위에서 아래로 정리해요.', '번호가 같으면 도서기호를 확인해요. 별도 위치 표시는 사서에게 물어요.'] },
  { title: '라벨·책 상태 확인', icon: 'help-buoy-outline', steps: ['라벨이 안 보이거나 책이 훼손되면 따로 두어요.', '“이 책의 라벨이 안 보여요.” 하고 사서에게 알려요.', '확인받은 책을 확인함에 놓아요. 라벨을 임의로 붙이거나 고치지 않아요.'] },
  { title: '이용자 안내', icon: 'search-outline', steps: ['이용자의 부탁을 끝까지 들어요.', '도서 검색 자리에서 제목·분류·현재 위치를 확인해요.', '찾는 책은 서가까지 안내해요. 읽던 책을 받아 정리했다면 이용자에게 알려 드려요.', '도움이 필요하면 사서에게 연결해요.'] },
  { title: '완료 보고', icon: 'checkmark-circle-outline', steps: ['가지고 온 책과 카트에 남은 책을 확인해요.', '서가에 꽂은 책과 확인함에 놓은 책을 따로 세어요.', '정리한 권수와 확인이 필요한 일을 사서에게 알려요.'] },
] as const;
