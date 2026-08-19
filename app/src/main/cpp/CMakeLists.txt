cmake_minimum_required(VERSION 3.22.1)
project("rebel_native")

add_library(rebel_native SHARED rebel_native.cpp)

find_library(log-lib log)

target_compile_options(rebel_native PRIVATE
        -O2 -fvisibility=hidden -fno-exceptions -fno-rtti)

target_link_libraries(rebel_native ${log-lib})
