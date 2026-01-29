from rest_framework.pagination import CursorPagination


class MessageInfiniteScrollPagination(CursorPagination):

    page_size = 35
    ordering = '-timestamp' 
    cursor_query_param = 'cursor'
    